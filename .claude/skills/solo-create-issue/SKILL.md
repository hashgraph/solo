---
name: solo-create-issue
description: Create a GitHub issue in hiero-ledger/solo, add it to the Solo X Team project, and set its type, status, priority, and labels — all IDs pre-resolved, single Bash call running 3–4 chained GraphQL mutations.
license: MIT
metadata:
  author: Jeromy Cannon
  version: "2.0.0"
  domain: github
  triggers: solo issue, create solo github issue, solo-create-issue
  role: developer
  scope: project-management
  output-format: url
---

# Solo Create Issue

Parse the user's request and create a GitHub issue in `hiero-ledger/solo` with full project
metadata using **one `Bash` tool call** that runs all GraphQL mutations sequentially in a single
script. All IDs are pre-resolved — no lookup calls needed.

## Step 1 — Parse the user's request

Extract the following from the user's natural-language description:

| Field | How to determine |
|-------|-----------------|
| **Title** | Synthesize a clear, action-oriented title (≤ 80 chars) |
| **Body** | Write a structured body (see Body Format below) |
| **Issue Type** | Explicit mention or infer from context (default: Task) |
| **Priority** | Explicit P0/P1/P2 or infer from urgency language (default: P1) |
| **Status** | Explicit mention or default to Ready; use Backlog when the issue has unresolved blockers |
| **Labels** | Always include the priority label; add others based on content |
| **Parent issue** | If the user mentions a parent epic/initiative, capture its node ID for `addSubIssue` |

### Body Format

```markdown
## Overview
<2-4 sentence summary of the goal and motivation>

## Sub-Tasks
- [ ] Sub-task one
- [ ] Sub-task two

## Prerequisites
- [ ] Any blockers or dependencies (omit section if none)

### Dependencies
- [ ] requires #N    ← issues this one depends on
- [ ] required by #N ← issues that depend on this one

## References
- [Link text](url) — one line per reference (omit section if none)
```

## Step 2 — Resolve IDs from the tables below

### Repository (fixed)

| Name | ID |
|------|----|
| Repo `hiero-ledger/solo` | `R_kgDOLMTWdQ` |

### Issue Types

| Type | ID |
|------|----|
| Task | `IT_kwDOCq2Q984BY34v` |
| Bug  | `IT_kwDOCq2Q984BY34w` |
| Feature | `IT_kwDOCq2Q984BY34x` |
| Epic | `IT_kwDOCq2Q984BhYEV` |

### Solo X Team Project

| Name | ID |
|------|-----|
| Project | `PVT_kwDOCq2Q984A6EW6` |
| Status field | `PVTSSF_lADOCq2Q984A6EW6zguwhjU` |
| Priority field | `PVTSSF_lADOCq2Q984A6EW6zguwhkA` |

#### Status Options

| Status | Option ID |
|--------|-----------|
| Blocked | `d1cbdd71` |
| New | `ce7fcfc9` |
| Backlog | `f75ad846` |
| Ready | `36d4dfb8` |
| In Progress | `47fc9ee4` |
| In Review | `9ef22b4d` |
| Changes Requested | `8220b383` |
| Done | `98236657` |

#### Priority Options

| Priority | Option ID |
|----------|-----------|
| P0-🔥 | `95df2dcd` |
| P1-💎 | `cb7cd29f` |
| P2-⏭️💎 | `1daa2fb8` |
| P3-⏭️⏭️💎 | `73273152` |
| P4-🎂 | `ec0b5147` |
| P5-🛑✋ | `7098597a` |

### Labels

| Label | ID |
|-------|----|
| P0-🔥 | `LA_kwDOLMTWdc8AAAABg4dJZQ` |
| P1-💎 | `LA_kwDOLMTWdc8AAAABg4dJag` |
| P2-⏭️💎 | `LA_kwDOLMTWdc8AAAABg4dJbw` |
| New Feature | `LA_kwDOLMTWdc8AAAABg4dJYA` |
| Feature Enhancement | `LA_kwDOLMTWdc8AAAABg4dJVg` |
| Bug | `LA_kwDOLMTWdc8AAAABg4dJNg` |
| Improvement | `LA_kwDOLMTWdc8AAAABg4dJWQ` |
| Security | `LA_kwDOLMTWdc8AAAABoo7kag` |
| Tech Debt | `LA_kwDOLMTWdc8AAAABttAENQ` |
| Documentation | `LA_kwDOLMTWdc8AAAABqht37g` |
| Needs Refinement | `LA_kwDOLMTWdc8AAAABue8Taw` |
| Audit | `LA_kwDOLMTWdc8AAAABg4dJIA` |
| Internal Requirement | `LA_kwDOLMTWdc8AAAABoowOng` |
| Requested by Stakeholder | `LA_kwDOLMTWdc8AAAABts_VSA` |
| Testing Improvements | `LA_kwDOLMTWdc8AAAABttAqEQ` |
| Epic | `LA_kwDOLMTWdc8AAAABiLao6g` |

### Priority → Label mapping (always include the priority label)

| Priority | Include label ID |
|----------|-----------------|
| P0 | `LA_kwDOLMTWdc8AAAABg4dJZQ` |
| P1 | `LA_kwDOLMTWdc8AAAABg4dJag` |
| P2 | `LA_kwDOLMTWdc8AAAABg4dJbw` |

## Step 3 — Execute all API calls in a single Bash tool call

**Combine all calls into one script and run as a single `Bash` tool invocation** — one approval
prompt instead of many.

The calls are sequential and chain outputs:
1. **Create issue** → capture `issue.id` and `issue.url` (type + labels set in this same mutation)
2. **Add to project** using `issue.id` → capture `item.id`
3. **Set Status + Priority** using `item.id` (both fields in one aliased mutation)
4. *(Optional)* **Link as sub-issue** if the user specified a parent epic/initiative

```bash
set -euo pipefail

TITLE="<synthesized title>"
BODY=$(cat <<'BODY_EOF'
<formatted body>
BODY_EOF
)

# ── Call 1: Create issue (type + labels included) ─────────────────────────────
RESPONSE1=$(gh api graphql -f query="
mutation {
  createIssue(input: {
    repositoryId: \"R_kgDOLMTWdQ\"
    title: $(echo "$TITLE" | jq -Rs .)
    issueTypeId: \"<ISSUE_TYPE_ID>\"
    labelIds: [\"<LABEL_ID_1>\"]
    body: $(echo "$BODY" | jq -Rs .)
  }) {
    issue { number url id }
  }
}")
ISSUE_ID=$(echo "$RESPONSE1"  | jq -r '.data.createIssue.issue.id')
ISSUE_URL=$(echo "$RESPONSE1" | jq -r '.data.createIssue.issue.url')

# ── Call 2: Add to Solo X Team project ───────────────────────────────────────
RESPONSE2=$(gh api graphql -f query="
mutation {
  addProjectV2ItemById(input: {
    projectId: \"PVT_kwDOCq2Q984A6EW6\"
    contentId: \"$ISSUE_ID\"
  }) {
    item { id }
  }
}")
ITEM_ID=$(echo "$RESPONSE2" | jq -r '.data.addProjectV2ItemById.item.id')

# ── Call 3: Set Status + Priority (aliased — one round trip) ──────────────────
gh api graphql -f query="
mutation {
  setStatus: updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwDOCq2Q984A6EW6\"
    itemId: \"$ITEM_ID\"
    fieldId: \"PVTSSF_lADOCq2Q984A6EW6zguwhjU\"
    value: { singleSelectOptionId: \"<STATUS_OPTION_ID>\" }
  }) { projectV2Item { id } }

  setPriority: updateProjectV2ItemFieldValue(input: {
    projectId: \"PVT_kwDOCq2Q984A6EW6\"
    itemId: \"$ITEM_ID\"
    fieldId: \"PVTSSF_lADOCq2Q984A6EW6zguwhkA\"
    value: { singleSelectOptionId: \"<PRIORITY_OPTION_ID>\" }
  }) { projectV2Item { id } }
}" > /dev/null

# ── Call 4 (optional): Link as sub-issue of parent epic/initiative ────────────
# Uncomment and set PARENT_NODE_ID when user specifies a parent.
# Get it via: gh api graphql -f query='{ repository(owner:"hiero-ledger",name:"solo") { issue(number:N) { id } } }'
#
# PARENT_NODE_ID="<parent issue node ID>"
# gh api graphql -f query="
# mutation {
#   addSubIssue(input: {
#     issueId: \"$PARENT_NODE_ID\"
#     subIssueId: \"$ISSUE_ID\"
#     replaceParent: false
#   }) { issue { number } subIssue { number } }
# }" > /dev/null

echo "$ISSUE_URL"
```

## Step 4 — Report result

```
Created: <issue url>
Title:    <title>
Type:     <type>  |  Priority: <P0/P1/P2>  |  Status: <status>
Labels:   <label names>
Project:  Solo X Team
```

## Tips from the field

- **Batch creation**: when creating many issues (e.g. populating an epic), capture all issue IDs
  first in Pass 1, then do a second pass to patch cross-reference links (`- [ ] requires #N` /
  `- [ ] required by #N`) into each body once all numbers are known.
- **Status guidance**: use **Ready** for issues with no blockers; use **Backlog** when the issue
  depends on other issues being completed first.
- **Parent node IDs for common epics/initiatives** (save a lookup):

  | Issue | # | Node ID |
  |-------|---|---------|
  | 2026 Q3 — Developer Experience | 5004 | `I_kwDOLMTWdc8AAAABIo7dFw` |
  | 2026 Q3 — User Experience | 5002 | `I_kwDOLMTWdc8AAAABIoWEfQ` |
  | 2026 Q3 — Technical Debt | 5018 | `I_kwDOLMTWdc8AAAABIqZ7jQ` |
