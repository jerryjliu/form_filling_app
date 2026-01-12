---
description: Research and document codebase as-is, outputting to research/ directory
model: opus
---

# Research Codebase

You are tasked with conducting comprehensive research across the codebase to answer user questions by spawning parallel sub-agents and synthesizing their findings.

## CRITICAL: YOUR ONLY JOB IS TO DOCUMENT AND EXPLAIN THE CODEBASE AS IT EXISTS TODAY
- DO NOT suggest improvements or changes unless the user explicitly asks for them
- DO NOT perform root cause analysis unless the user explicitly asks for them
- DO NOT propose future enhancements unless the user explicitly asks for them
- DO NOT critique the implementation or identify problems
- DO NOT recommend refactoring, optimization, or architectural changes
- ONLY describe what exists, where it exists, how it works, and how components interact
- You are creating a technical map/documentation of the existing system

## Initial Setup:

When this command is invoked, respond with:
```
I'm ready to research the codebase. Please provide your research question or area of interest, and I'll analyze it thoroughly by exploring relevant components and connections.
```

Then wait for the user's research query.

## Steps to follow after receiving the research query:

1. **Read any directly mentioned files first:**
   - If the user mentions specific files (tickets, docs, JSON), read them FULLY first
   - **IMPORTANT**: Use the Read tool WITHOUT limit/offset parameters to read entire files
   - **CRITICAL**: Read these files yourself in the main context before spawning any sub-tasks
   - This ensures you have full context before decomposing the research

2. **Analyze and decompose the research question:**
   - Break down the user's query into composable research areas
   - Take time to ultrathink about the underlying patterns, connections, and architectural implications the user might be seeking
   - Identify specific components, patterns, or concepts to investigate
   - Create a research plan using TodoWrite to track all subtasks
   - Consider which directories, files, or architectural patterns are relevant

3. **Spawn parallel sub-agent tasks for comprehensive research:**
   - Create multiple Task agents to research different aspects concurrently
   - Use `Task(agent="general-agent", command="...")` for all research tasks
   - Each task should have a clear, specific focus

   **For codebase research:**
   - **Locate files/components**: Spawn a task to find WHERE files and components live
     - Example: `Task(agent="general-agent", command="Find all files related to [topic]. Search through the codebase and list file paths, their purposes, and key exports/functions. Focus on locating components without evaluating them.")`
   
   - **Analyze specific code**: Spawn a task to understand HOW specific code works (without critiquing it)
     - Example: `Task(agent="general-agent", command="Read and document how [component/file] works. Describe the implementation, key functions, data flow, and dependencies. Only describe what exists, don't suggest improvements.")`
   
   - **Find patterns**: Spawn a task to find examples of existing patterns (without evaluating them)
     - Example: `Task(agent="general-agent", command="Search for all instances where [pattern] is used in the codebase. Document each example with file paths and line numbers. Describe the pattern as it exists without evaluation.")`

   **For thoughts directory:**
   - **Discover documents**: Spawn a task to find what documents exist about the topic
     - Example: `Task(agent="general-agent", command="Search the thoughts/ directory for any documents related to [topic]. List all relevant files with their paths and brief summaries of what they contain.")`
   
   - **Extract insights**: Spawn a task to extract key insights from specific documents (only the most relevant ones)
     - Example: `Task(agent="general-agent", command="Read [specific thought documents] and extract key insights about [topic]. Provide quotes and references with file paths.")`

   **For web research (only if user explicitly asks):**
   - **External research**: Spawn a task for external documentation and resources
     - Example: `Task(agent="general-agent", command="Search the web for documentation about [topic]. Return findings with links to the sources. Focus on official documentation and authoritative sources.")`
   - IF you use web-research tasks, instruct them to return LINKS with their findings, and please INCLUDE those links in your final report

   **For Linear tickets (if relevant):**
   - **Read tickets**: Spawn a task to get full details of a specific ticket
     - Example: `Task(agent="general-agent", command="Read Linear ticket [TICKET-ID] and extract all details including description, comments, status, and related information.")`
   
   - **Search tickets**: Spawn a task to find related tickets or historical context
     - Example: `Task(agent="general-agent", command="Search Linear for tickets related to [topic]. List relevant tickets with their IDs, titles, and brief summaries.")`

   **Key principles for spawning tasks:**
   - Each task should be self-contained with clear instructions
   - Always remind tasks they are documenting, not evaluating: "Only describe what exists, don't suggest improvements or identify problems"
   - Run multiple tasks in parallel when they're searching for different things
   - Be specific about what you're looking for and what format you want back
   - Include context about what you need (file paths, line numbers, examples, etc.)

4. **Wait for all sub-agents to complete and synthesize findings:**
   - IMPORTANT: Wait for ALL sub-agent tasks to complete before proceeding
   - Compile all sub-agent results (both codebase and thoughts findings)
   - Prioritize live codebase findings as primary source of truth
   - Use thoughts/ findings as supplementary historical context
   - Connect findings across different components
   - Include specific file paths and line numbers for reference
   - Verify all thoughts/ paths are correct (e.g., thoughts/allison/ not thoughts/shared/ for personal files)
   - Highlight patterns, connections, and architectural decisions
   - Answer the user's specific questions with concrete evidence

5. **Gather metadata for the research document:**
   - Get current git info: `git rev-parse HEAD` and `git branch --show-current`
   - Filename: `research/YYYY-MM-DD-description.md`
     - Format: `YYYY-MM-DD-description.md` where:
       - YYYY-MM-DD is today's date
       - description is a brief kebab-case description of the research topic
     - Examples:
       - `2025-01-08-authentication-flow.md`
       - `2025-01-08-agent-streaming.md`

6. **Write research document:**
   - Write the document to `research/YYYY-MM-DD-description.md` using the Write tool
   - Use the metadata gathered in step 5
   - Structure the document with YAML frontmatter followed by content:
     ```markdown
     ---
     date: [Current date and time with timezone in ISO format]
     researcher: [Researcher name from thoughts status]
     git_commit: [Current commit hash]
     branch: [Current branch name]
     repository: [Repository name]
     topic: "[User's Question/Topic]"
     tags: [research, codebase, relevant-component-names]
     status: complete
     last_updated: [Current date in YYYY-MM-DD format]
     last_updated_by: [Researcher name]
     ---

     # Research: [User's Question/Topic]

     **Date**: [Current date and time with timezone from step 5]
     **Researcher**: [Researcher name from thoughts status]
     **Git Commit**: [Current commit hash from step 5]
     **Branch**: [Current branch name from step 5]
     **Repository**: [Repository name]

     ## Research Question
     [Original user query]

     ## Summary
     [High-level documentation of what was found, answering the user's question by describing what exists]

     ## Detailed Findings

     ### [Component/Area 1]
     - Description of what exists ([file.ext:line](link))
     - How it connects to other components
     - Current implementation details (without evaluation)

     ### [Component/Area 2]
     ...

     ## Code References
     - `path/to/file.py:123` - Description of what's there
     - `another/file.ts:45-67` - Description of the code block

     ## Architecture Documentation
     [Current patterns, conventions, and design implementations found in the codebase]

     ## Historical Context (from thoughts/)
     [Relevant insights from thoughts/ directory with references]
     - `thoughts/shared/something.md` - Historical decision about X
     - `thoughts/local/notes.md` - Past exploration of Y
     Note: Paths exclude "searchable/" even if found there

     ## Related Research
     [Links to other research documents in research/]

     ## Open Questions
     [Any areas that need further investigation]
     ```

7. **Add GitHub permalinks (if applicable):**
   - Check if on main branch or if commit is pushed: `git branch --show-current` and `git status`
   - If on main/master or pushed, generate GitHub permalinks:
     - Get repo info: `gh repo view --json owner,name`
     - Create permalinks: `https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}`
   - Replace local file references with permalinks in the document

8. **Sync and present findings:**
   - Present a concise summary of findings to the user
   - Include key file references for easy navigation
   - Ask if they have follow-up questions or need clarification

9. **Handle follow-up questions:**
   - If the user has follow-up questions, append to the same research document
   - Update the frontmatter fields `last_updated` and `last_updated_by` to reflect the update
   - Add `last_updated_note: "Added follow-up research for [brief description]"` to frontmatter
   - Add a new section: `## Follow-up Research [timestamp]`
   - Spawn new sub-agents as needed for additional investigation
   - Continue updating the document and syncing

## Important notes:
- Always use parallel Task agents to maximize efficiency and minimize context usage
- Use `Task(agent="general-agent", command="...")` for all sub-agent tasks
- Always run fresh codebase research - never rely solely on existing research documents
- The thoughts/ directory provides historical context to supplement live findings
- Focus on finding concrete file paths and line numbers for developer reference
- Research documents should be self-contained with all necessary context
- Each sub-agent prompt should be specific and focused on read-only documentation operations
- Document cross-component connections and how systems interact
- Include temporal context (when the research was conducted)
- Link to GitHub when possible for permanent references
- Keep the main agent focused on synthesis, not deep file reading
- Have sub-agents document examples and usage patterns as they exist
- Explore all of thoughts/ directory, not just research subdirectory
- **CRITICAL**: You and all sub-agents are documentarians, not evaluators
- **REMEMBER**: Document what IS, not what SHOULD BE
- **NO RECOMMENDATIONS**: Only describe the current state of the codebase
- **File reading**: Always read mentioned files FULLY (no limit/offset) before spawning sub-tasks
- **Critical ordering**: Follow the numbered steps exactly
  - ALWAYS read mentioned files first before spawning sub-tasks (step 1)
  - ALWAYS wait for all sub-agents to complete before synthesizing (step 4)
  - ALWAYS gather metadata before writing the document (step 5 before step 6)
  - NEVER write the research document with placeholder values
- **Path handling**: The thoughts/searchable/ directory contains hard links for searching
  - Always document paths by removing ONLY "searchable/" - preserve all other subdirectories
  - Examples of correct transformations:
    - `thoughts/searchable/allison/old_stuff/notes.md` → `thoughts/allison/old_stuff/notes.md`
    - `thoughts/searchable/shared/prs/123.md` → `thoughts/shared/prs/123.md`
    - `thoughts/searchable/global/shared/templates.md` → `thoughts/global/shared/templates.md`
  - NEVER change allison/ to shared/ or vice versa - preserve the exact directory structure
  - This ensures paths are correct for editing and navigation
- **Frontmatter consistency**:
  - Always include frontmatter at the beginning of research documents
  - Keep frontmatter fields consistent across all research documents
  - Update frontmatter when adding follow-up research
  - Use snake_case for multi-word field names (e.g., `last_updated`, `git_commit`)
  - Tags should be relevant to the research topic and components studied
