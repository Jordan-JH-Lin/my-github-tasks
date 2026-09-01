// Pulls "assigned to me"-style task data for every member of every GitHub
// org the configured token can see, and writes docs/data.json for the
// static dashboard page to render.
//
// Requires: Node 20+ (global fetch), env var GH_TOKEN with scopes
// read:org + repo + project (classic PAT) or equivalent fine-grained perms.

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  console.error("Missing GH_TOKEN environment variable");
  process.exit(1);
}

const GRAPHQL_URL = "https://api.github.com/graphql";

async function gql(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    // Some errors (e.g. FORBIDDEN on a single org's members) are non-fatal;
    // surface them but let the caller decide whether to continue.
    const msg = json.errors.map((e) => e.message).join("; ");
    const err = new Error(msg);
    err.graphqlErrors = json.errors;
    err.data = json.data;
    throw err;
  }
  return json.data;
}

function loadConfiguredOrgs() {
  const configPath = path.join(__dirname, "..", "config", "orgs.json");
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function loadExcludedProjectUrls() {
  const configPath = path.join(__dirname, "..", "config", "excluded-projects.json");
  return new Set(JSON.parse(fs.readFileSync(configPath, "utf8")));
}

async function listOrgMembers(org) {
  const query = `
    query($org: String!, $cursor: String) {
      organization(login: $org) {
        membersWithRole(first: 100, after: $cursor) {
          nodes { login name avatarUrl }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;
  const members = [];
  let cursor = null;
  while (true) {
    const data = await gql(query, { org, cursor });
    const page = data.organization.membersWithRole;
    members.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  return members;
}

function projectOwnerLogin(owner) {
  if (!owner) return null;
  return owner.login || null;
}

async function searchAssignedIssues(login, excludedProjectUrls, allowedOrgs) {
  const query = `
    query($q: String!, $cursor: String) {
      search(query: $q, type: ISSUE, first: 50, after: $cursor) {
        nodes {
          ... on Issue {
            number
            title
            url
            state
            repository { name owner { login } }
            projectItems(first: 10) {
              nodes {
                project {
                  title
                  url
                  owner {
                    ... on Organization { login }
                    ... on User { login }
                  }
                }
                statusField: fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
                deadlineField: fieldValueByName(name: "Deadline") {
                  ... on ProjectV2ItemFieldDateValue { date }
                }
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const q = `assignee:${login} is:issue is:open archived:false`;
  const items = [];
  let cursor = null;
  while (true) {
    const data = await gql(query, { q, cursor });
    for (const node of data.search.nodes) {
      if (!node || !node.repository) continue; // skip PRs / other types if any slip through
      const repoOwner = node.repository.owner.login;
      const repoName = node.repository.name;
      // Issues never added to any Projects v2 board are dropped: this
      // dashboard is meant to be project-centric only.
      if (node.projectItems.nodes.length > 0) {
        for (const pi of node.projectItems.nodes) {
          if (excludedProjectUrls.has(pi.project.url)) continue;
          const org = projectOwnerLogin(pi.project.owner) || repoOwner;
          if (!allowedOrgs.has(org)) continue;
          items.push({
            org,
            project: pi.project.title,
            projectUrl: pi.project.url,
            repo: repoName,
            number: node.number,
            title: node.title,
            url: node.url,
            state: node.state,
            status: pi.statusField ? pi.statusField.name : null,
            deadline: pi.deadlineField ? pi.deadlineField.date : null,
          });
        }
      }
    }
    if (!data.search.pageInfo.hasNextPage) break;
    cursor = data.search.pageInfo.endCursor;
  }
  return items;
}

async function main() {
  const orgs = loadConfiguredOrgs();
  const allowedOrgs = new Set(orgs);
  const excludedProjectUrls = loadExcludedProjectUrls();
  console.log(`Using ${orgs.length} configured orgs: ${orgs.join(", ")}`);
  console.log(`Excluding ${excludedProjectUrls.size} projects`);

  const memberMap = new Map(); // login -> { login, name, avatarUrl }
  for (const org of orgs) {
    try {
      const members = await listOrgMembers(org);
      for (const m of members) {
        if (!memberMap.has(m.login)) memberMap.set(m.login, m);
      }
      console.log(`  ${org}: ${members.length} members`);
    } catch (e) {
      console.warn(`  ${org}: could not list members (${e.message})`);
    }
  }

  const roster = Array.from(memberMap.values()).sort((a, b) =>
    a.login.localeCompare(b.login)
  );
  console.log(`Combined roster: ${roster.length} people`);

  const users = [];
  for (const person of roster) {
    try {
      const items = await searchAssignedIssues(person.login, excludedProjectUrls, allowedOrgs);
      users.push({ ...person, items });
      console.log(`  ${person.login}: ${items.length} assigned items`);
    } catch (e) {
      console.warn(`  ${person.login}: search failed (${e.message})`);
      users.push({ ...person, items: [], error: e.message });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    orgs,
    users,
  };

  const outPath = path.join(__dirname, "..", "docs", "data.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
