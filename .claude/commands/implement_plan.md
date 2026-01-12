---
description: Implement technical plans from plans/ directory with verification
---

# Implement Plan

You are tasked with implementing an approved technical plan from the `plans/` directory. These plans contain phases with specific changes and success criteria.

## Getting Started

When given a plan path:
- Read the plan completely and check for any existing checkmarks (- [x])
- Read all files mentioned in the plan
- **Read files fully** - never use limit/offset parameters, you need complete context
- Think deeply about how the pieces fit together
- Create a todo list to track your progress
- Start implementing if you understand what needs to be done

If no plan path provided, ask for one or list available plans in `plans/`.

## Implementation Philosophy

Plans are carefully designed, but reality can be messy. Your job is to:
- Follow the plan's intent while adapting to what you find
- Implement each phase fully before moving to the next
- Verify your work makes sense in the broader codebase context
- Update checkboxes in the plan as you complete sections

When things don't match the plan exactly, think about why and communicate clearly. The plan is your guide, but your judgment matters too.

If you encounter a mismatch:
- STOP and think deeply about why the plan can't be followed
- Present the issue clearly:
  ```
  Issue in Phase [N]:
  Expected: [what the plan says]
  Found: [actual situation]
  Why this matters: [explanation]
  How should I proceed?
  ```

## Verification Approach

After implementing a phase:
- Run the success criteria checks
- Fix any issues before proceeding
- Update your progress in both the plan and your todos
- Check off completed items in the plan file itself using Edit

**Pause for human verification**: After completing all automated verification for a phase, pause and inform the human that the phase is ready for manual testing:

```
Phase [N] Complete - Ready for Manual Verification

Automated verification passed:
- [List automated checks that passed]

Please perform the manual verification steps listed in the plan:
- [List manual verification items from the plan]

Let me know when manual testing is complete so I can proceed to Phase [N+1].
```

If instructed to execute multiple phases consecutively, skip the pause until the last phase. Otherwise, assume you are just doing one phase.

Do not check off items in the manual testing steps until confirmed by the user.

## If You Get Stuck

When something isn't working as expected:
- First, make sure you've read and understood all the relevant code
- Consider if the codebase has evolved since the plan was written
- Present the mismatch clearly and ask for guidance

Use the Task tool sparingly - mainly for targeted debugging or exploring unfamiliar territory:

**Targeted debugging:**
```
Use Task tool with subagent_type="Explore" to debug why [specific test] is failing. Check the test file, the implementation, and any related dependencies. Return the root cause with file:line references.
```

**Exploring unfamiliar code:**
```
Use Task tool with subagent_type="Explore" to read and explain how [unfamiliar system/component] works. Document the architecture and key functions with file:line references.
```

**Finding examples:**
```
Use Task tool with subagent_type="Explore" to find examples of [pattern] in the codebase that we can follow. Return file paths and code snippets showing the pattern in use.
```

Keep sub-tasks focused on specific problems rather than general exploration.

## Resuming Work

If the plan has existing checkmarks:
- Trust that completed work is done
- Pick up from the first unchecked item
- Verify previous work only if something seems off

Remember: You're implementing a solution, not just checking boxes. Keep the end goal in mind and maintain forward momentum.

## Common Commands for This Project

**Backend:**
```bash
# Install dependencies
cd backend && pip install -r requirements.txt

# Run backend server
cd backend && python main.py

# Run tests
cd backend && pytest

# Type check (if mypy configured)
cd backend && mypy .
```

**Frontend:**
```bash
# Install dependencies
cd web && npm install

# Run dev server
cd web && npm run dev

# Type check
cd web && npm run typecheck

# Lint
cd web && npm run lint

# Build
cd web && npm run build
```

## Project Context

This is a presentation generation app built with:
- **Backend**: FastAPI + Claude Agent SDK + python-pptx
- **Frontend**: Next.js + React + TypeScript + Tailwind CSS
- **Architecture**: Forked from form-filling-exp repository

Key files:
- `prompts/research.md` - Comprehensive research on the architecture
- `backend/agent.py` - Claude Agent SDK integration with presentation tools
- `backend/pptx_processor.py` - PowerPoint operations using python-pptx
- `backend/main.py` - FastAPI server with SSE streaming
- `web/src/app/page.tsx` - Main frontend component
- `web/src/lib/api.ts` - API client with SSE support

## Workflow Example

```
User: /implement_plan plans/2026-01-09-add-slide-templates.md

Assistant: [Reads the plan file]
         [Creates todo list from phases]
         [Reads all referenced files]
         [Implements Phase 1]
         [Runs verification]
         [Updates checkboxes in plan]

Phase 1 Complete - Ready for Manual Verification

Automated verification passed:
- Backend tests pass
- Type checking passes

Please verify:
- [ ] Slide templates render correctly in browser
- [ ] Templates can be selected from dropdown

User: Manual testing passed, continue to Phase 2

Assistant: [Implements Phase 2...]
```
