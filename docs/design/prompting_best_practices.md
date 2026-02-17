# Prompting Best Practices

Principles for effective LLM prompt engineering based on practical experience and systematic experimentation.

---

## Core Principles

---

### 1. Hallucination Prevention

**The Problem**: LLMs confidently fabricate information when lacking data.

**Prevention Strategies**:

1. **Explicit Source Tracing**
   - Every claim must cite specific source (file, line, section)
   - Flag when data is NOT found: `[NOT FOUND IN SOURCE]`
   - Label inferred vs extracted: `[INFERRED]` vs `[EXTRACTED]`

2. **Confidence Levels**
   - HIGH: Data explicitly stated in source, 5+ supporting quotes
   - MEDIUM: Data inferred from patterns, 3-5 supporting quotes
   - LOW: Minimal source support (<3 quotes), significant gaps

3. **Data Quality Flags**
   - `[NOT FOUND IN SOURCE]` - Data doesn't exist
   - `[COMPETITIVE GAP NOT VERIFIED]` - Claim unconfirmed
   - `[INSUFFICIENT DATA]` - <3 quotes supporting claim
   - `[INFERRED]` - Based on reasoning, not extraction
   - `[EXTRACTED]` - Directly from source data

4. **Extract-Synthesize Pattern**
   - **Step A (Extract)**: Zero hallucination tolerance - only what's in sources
   - **Step B (Synthesize)**: Documented reasoning, explicit confidence levels
   - User validation for uncertain inferences

**When to Apply**:
- Strategic synthesis from multiple sources
- Building profiles from public work
- Competitive intelligence gathering
- Any claim that will drive decisions

---

### 2. Security Architecture

**The Problem**: Prompt injection allows untrusted input to execute privileged operations.

**Defense Patterns**:

1. **Dual-Model Security**
   - Privileged LLM for trusted data only
   - Quarantined LLM for untrusted input
   - Never mix the two

2. **Input Validation**
   - Treat all user input as potentially malicious
   - Sanitize before processing
   - Use structured formats (JSON) over free text when possible

3. **Principle of Least Privilege**
   - Grant minimal permissions needed
   - Separate read from write operations
   - Require explicit confirmation for destructive actions

**When to Apply**:
- User-facing applications
- Data from external sources
- Operations with side effects
- Anything involving file writes or API calls

---

### 3. Reproducibility & Documentation

**The Problem**: Ad-hoc prompts work once but can't be replicated or improved.

**Documentation Standards**:

1. **Prompt Templates**
   - Save successful prompts as templates
   - Document what works, what doesn't
   - Include example inputs/outputs

2. **Meta-Programming Pattern**
   - Write plan first
   - Iterate on plan
   - Save as template
   - Implement step-by-step

3. **Version Control**
   - Track prompt evolution
   - Document why changes were made
   - A/B test variations

4. **Traceability**
   - Link outputs to prompt version used
   - Preserve conversation context
   - Document edge cases and failures

**When to Apply**:
- Building reusable systems
- Patterns used repeatedly
- Team collaboration on prompts
- Production deployments

---

### 4. Structured Outputs

**The Problem**: Free-form text is hard to parse, validate, and use programmatically.

**Best Practices**:

1. **Use Structured Formats**
   - JSON for data extraction
   - Markdown tables for comparisons
   - YAML for configuration
   - Consistent formatting rules

2. **Output Schemas**
   - Define expected structure upfront
   - Validate against schema
   - Provide examples of correct format

3. **Validation Checklists**
   - Build quality checks into prompts
   - Self-validation before submission
   - User review with structured questions

**When to Apply**:
- Data extraction tasks
- Integration with downstream systems
- Quality control requirements
- Automated processing of outputs

---

### 5. Iterative Refinement

**The Problem**: Trying to get perfect output on first attempt wastes time and reduces quality.

**Iterative Process**:

1. **Start Simple**
   - One-line → One file → One system → New architecture
   - Don't over-engineer upfront
   - Build complexity incrementally

2. **Feedback Loops**
   - Show draft, get feedback, refine
   - Multiple rounds beats one perfect attempt
   - Catch errors early when cheap to fix

3. **A/B Testing**
   - Try multiple approaches
   - Measure what works
   - Document learnings

4. **Version Evolution**
   - v1: Get something working
   - v2: Make it good
   - v3: Make it robust

**When to Apply**:
- Complex or novel tasks
- High-stakes outputs
- Learning new domains
- Building reusable systems

---

### 6. Role & Persona Clarity

**The Problem**: Vague roles lead to inconsistent outputs and confused models.

**Clarity Strategies**:

1. **Explicit Role Definition**
   - State role clearly at start
   - Define expertise boundaries
   - Specify what NOT to do

2. **Authentic Voice Capture**
   - Extract from substantial public work (3+ sources)
   - Trace to specific sources with citations
   - Preserve actual frameworks, not generic wisdom

3. **Behavioral Constraints**
   - Writing style (imperative, concise, technical)
   - Tone (warm, analytical, critical)
   - Anti-patterns (no buzzwords, no hand-waving)

**When to Apply**:
- Advisor profiles
- Character-consistent outputs
- Domain expertise simulation
- Brand voice maintenance

---

### 7. Error Handling & Edge Cases

**The Problem**: Prompts fail on unexpected inputs or edge cases.

**Robust Patterns**:

1. **Explicit Error Conditions**
   - Define what to do when data is missing
   - Handle empty results gracefully
   - Provide fallback behaviors

2. **Validation Gates**
   - Check prerequisites before execution
   - Validate inputs meet requirements
   - Fail fast with clear error messages

3. **Graceful Degradation**
   - Continue with partial data if possible
   - Flag what's missing vs stopping entirely
   - Offer alternatives when blocked

**When to Apply**:
- Production systems
- User-facing tools
- Multi-step workflows
- Integration with external data

---

### 8. XML Tag Structure

**The Problem**: Unstructured prompts lead to misinterpretation, difficult maintenance, and unparseable outputs.

**Benefits of XML Tags**:

1. **Clarity**: Separates prompt components distinctly, ensuring proper structure
2. **Accuracy**: Reduces misinterpretation errors by the model
3. **Flexibility**: Enables easy modification of prompt sections without full rewrites
4. **Parseability**: Makes it easy to extract specific parts of responses via post-processing

**Best Practices**:

1. **Be Consistent**
   - Use identical tag names throughout prompts
   - Reference tags when discussing content: "Using the contract in `<contract>` tags..."

2. **Nest Appropriately**
   - Structure tags hierarchically: `<outer><inner></inner></outer>`
   - Use nesting for layered or grouped content

3. **Use Meaningful Names**
   - No canonical "best" tag names exist
   - Tag names should make sense with the information they surround
   - Common tags: `<instructions>`, `<example>`, `<formatting>`, `<data>`, `<findings>`, `<recommendations>`

4. **Combine with Other Techniques**
   - Multishot prompting: `<examples>` with multiple `<example>` children
   - Chain of thought: `<thinking>` for reasoning, `<answer>` for final output
   - Structured outputs: `<response>` wrapping JSON or formatted content

**Example Structure**:
```xml
<instructions>
Analyze the following data and provide recommendations.
</instructions>

<data>
[Source information here]
</data>

<formatting>
Return findings as bullet points, then numbered recommendations.
</formatting>
```

**When to Apply**:
- Complex prompts with multiple components
- Prompts requiring specific output formats
- Tasks needing clear separation of instructions, data, and examples
- Automated pipelines that parse LLM outputs

---

### 9. Context Window Management

**The Problem**: Long conversations exhaust available context, causing degraded performance, lost state, or failed tasks.

**Management Strategies**:

1. **Token Budget Awareness**
   - Claude 4.5 tracks remaining context throughout conversations
   - Design prompts that leverage this awareness
   - Front-load critical information; put variable content later

2. **Fresh Context vs Compaction**
   - Starting fresh often beats aggressive summarization
   - Compaction loses nuance and edge cases
   - Use structured handoff documents for multi-session work

3. **State Persistence Patterns**
   - JSON for schema-dependent data (configurations, structured outputs)
   - Unstructured text for progress notes and reasoning
   - Git for cross-session persistence with full change history

4. **Multi-Window Workflows**
   - Use different prompts for initial vs continuation windows
   - Create setup context to prevent repeated explanation
   - Write specs/requirements in structured formats before starting

**Example State Handoff**:
```json
{
  "task": "Develop positioning document",
  "completed": ["competitive analysis", "customer interview synthesis"],
  "in_progress": "draft value propositions",
  "blocked": [],
  "decisions_made": [
    {"decision": "Lead with transformation, not features", "reason": "Aligns with customer language"}
  ]
}
```

**When to Apply**:
- Tasks spanning multiple conversation windows
- Complex projects requiring state tracking
- Collaborative work across sessions
- Long-running strategic analysis

---

### 10. Tool & Action Patterns

**The Problem**: Ambiguous prompts cause models to suggest when you want implementation, or act when you want discussion.

**Clarity Strategies**:

1. **Explicit Action Intent**
   - "Write this section..." → triggers creation
   - "Can you suggest how to..." → gets suggestions only
   - "Create X" vs "How would you approach X"

2. **Action Mode Tags**
   - `<default_to_action>` - Bias toward implementation
   - `<do_not_act_before_instructions>` - Conservative, ask-first mode
   - Be explicit about which mode you want

3. **Parallel vs Sequential Execution**
   - Identify independent operations that can run simultaneously
   - Use `<use_parallel_tool_calls>` for efficiency gains
   - Use `<sequential_execution>` when order matters or for debugging

4. **Reduced Aggressive Language**
   - Claude 4.x responds better to normal phrasing
   - "Use this tool when..." beats "CRITICAL: You MUST use..."
   - Reserve emphasis for genuinely critical constraints

**Anti-Pattern Examples**:
```
# Ambiguous (will likely suggest, not act)
"Can you fix the intro section?"

# Clear action intent
"Rewrite the intro section to lead with the customer pain point."

# Clear discussion intent
"What approaches could strengthen the intro? Don't rewrite yet."
```

**When to Apply**:
- Agentic workflows with tool access
- Tasks where action vs discussion matters
- Performance-critical pipelines (parallel execution)
- Prompts that have been misinterpreted before

---

### 11. Source-First Exploration

**The Problem**: Proposing changes or synthesis without reviewing source material produces flawed outputs, incorrect assumptions, and wasted iterations.

**Exploration Discipline**:

1. **Read Before Writing**
   - Always review source documents before proposing changes
   - Understand the full context, not just the target section
   - Check related documents, dependencies, and cross-references

2. **Understand Existing Patterns First**
   - Review document style (tone, formatting, structure)
   - Identify existing frameworks before creating new ones
   - Match the established voice and conventions

3. **Never Speculate**
   - Don't claim knowledge of unreviewed sources
   - Flag uncertainty: "I haven't reviewed X yet, but assuming..."
   - Verify assumptions before synthesizing

4. **Systematic Search**
   - Be rigorous and persistent in searching for relevant material
   - Check multiple potential locations
   - Follow the reference chain

**Validation Checklist**:
- [ ] Have I read the documents I'm synthesizing from?
- [ ] Do I understand how this connects to related materials?
- [ ] Have I checked for similar patterns elsewhere?
- [ ] Am I matching existing voice and conventions?
- [ ] Are my claims traceable to specific sources?

**When to Apply**:
- Any document modification or synthesis task
- Strategic analysis from multiple sources
- Content creation building on existing materials
- Review and revision work

---

### 12. Extended Thinking

**The Problem**: Complex reasoning benefits from explicit reflection, but improper use of thinking triggers can cause issues or waste tokens.

**Thinking Strategies**:

1. **Terminology Sensitivity**
   - When extended thinking is disabled, avoid "think" and variants
   - Use alternatives: "consider," "evaluate," "believe," "analyze"
   - Extended thinking mode handles "think" appropriately

2. **Post-Tool Reflection**
   - Prompt reflection on tool results before proceeding
   - "After reviewing the results, consider whether..."
   - Prevents rushing past important signals

3. **Guided Initial Thinking**
   - Direct the thinking toward specific concerns
   - "First evaluate X, then consider Y implications"
   - Structured thinking produces better results

4. **When Extended Thinking Helps**
   - Multi-step reasoning chains
   - Tasks requiring self-correction
   - Complex tradeoff analysis
   - Planning before implementation

**Example Reflection Prompt**:
```
After reviewing the competitive analysis, evaluate:
1. Which competitors pose direct vs indirect threats?
2. What's the pattern in their positioning weaknesses?
3. What's the minimal differentiation that addresses all gaps?

Then propose your positioning strategy.
```

**When to Apply**:
- Complex reasoning tasks
- Multi-step problem solving
- Post-research analysis
- Tasks benefiting from self-correction

---

### 13. Overeagerness Prevention

**The Problem**: Claude 4.x (especially Opus) tends toward over-engineering: extra sections, unnecessary frameworks, hypothetical scenario coverage.

**Constraint Strategies**:

1. **Scope Boundaries**
   - Only make changes directly requested or clearly necessary
   - A revision doesn't need surrounding sections rewritten
   - A simple document doesn't need extra frameworks

2. **Abstraction Discipline**
   - Don't create frameworks for one-time use
   - Three similar points don't need a new taxonomy
   - Don't design for hypothetical future requirements

3. **Edge Case Restraint**
   - Don't add coverage for scenarios that won't happen
   - Trust the stated requirements
   - Only address edge cases at explicit request

4. **Document Hygiene**
   - Don't create supplementary documents without clear need
   - Avoid versioning complexity when direct changes work
   - Delete unused content completely; don't comment it out

**Explicit Constraints** (add to prompts when needed):
```
Constraints:
- No sections beyond what's requested
- No frameworks for one-time analysis
- No coverage for hypothetical scenarios
- No supplementary documents unless explicitly requested
- Keep it focused and minimal
```

**When to Apply**:
- Document creation tasks
- Revision and editing requests
- Strategic analysis
- Any task where scope creep is a risk

---

## Anti-Patterns to Avoid

### Context Confusion
- **Don't**: Mix your interpretations with source material
- **Do**: Clearly separate extraction from synthesis

### Vague Requirements
- **Don't**: "Make it better" or "improve the output"
- **Do**: Specify exact criteria and examples

### Over-Engineering
- **Don't**: Build frameworks before understanding the problem
- **Do**: Start simple, add complexity only when needed

### Unchecked Assumptions
- **Don't**: Assume LLM knows your domain
- **Do**: Provide context, examples, constraints

### Security Naivety
- **Don't**: Trust user input or assume 99% protection is enough
- **Do**: Isolate untrusted input, use dual-model patterns

### Documentation Avoidance
- **Don't**: Rely on memory or one-off experiments
- **Do**: Document what works for reproducibility

---

## Evaluation Criteria

**How to know if a prompt is good**:

1. **Reproducibility**: Can someone else get same results?
2. **Traceability**: Can outputs be traced to sources?
3. **Robustness**: Does it handle edge cases?
4. **Clarity**: Is the role and task unambiguous?
5. **Efficiency**: Does it manage context appropriately?
6. **Security**: Does it protect against prompt injection?
7. **Validation**: Does it include quality checks?
8. **Documentation**: Is the pattern documented for reuse?

---

## Quick Reference

| Situation | Apply These Patterns |
|-----------|---------------------|
| Strategic synthesis from data | Extract-Synthesize Pattern, Confidence Levels |
| User-facing application | Dual-Model Security, Input Validation |
| Reusable workflow | Meta-Programming, Template Documentation |
| Data extraction | Structured Outputs, Output Schemas |
| Novel/complex task | Iterative Refinement, Feedback Loops |
| Authentic voice needed | Role Clarity, Source Tracing |
| Production deployment | Error Handling, Validation Gates |
| Complex multi-part prompts | XML Tag Structure, Consistent Naming |
| Automated output parsing | XML Tag Structure, Structured Outputs |
| Long/multi-session tasks | Context Window Management, State Persistence |
| Agentic tool workflows | Tool & Action Patterns, Parallel Execution |
| Document modification/synthesis | Source-First Exploration, Read Before Writing |
| Complex reasoning | Extended Thinking, Post-Tool Reflection |
| Scope creep risk | Overeagerness Prevention, Scope Boundaries |

---

## Sources & Further Reading

**Core Principles**: Practical prompt engineering work
- Context management patterns
- Hallucination prevention strategies
- Security architecture for LLM systems
- Reproducible prompt development

**Anthropic Documentation**:
- [Use XML Tags](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags) - Official guidance on XML tag structure in prompts
- [Claude 4 Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices) - Claude 4.x specific guidance on context management, tool patterns, extended thinking, and overeagerness prevention
