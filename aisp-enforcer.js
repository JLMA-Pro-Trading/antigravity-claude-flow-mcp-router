#!/usr/bin/env node
/**
 * AISP Enforcer Module
 * 
 * Injects AISP 5.1 specification context into agent-to-agent communication
 * while preserving natural language for user-facing responses.
 */

/**
 * AISP 5.1 Platinum Specification
 * Source: /workspaces/jlmaworkspace/new_projects/aisp_mcp/plan/docs/AISP/AI_GUIDE.md
 */
export const AISP_SPEC = `
𝔸5.1.complete@2026-01-09
γ≔aisp.specification.router-enforced
ρ≔⟨agent-communication,anti-drift,proof-carrying⟩
⊢ND∧CAT∧ΠΣ∧μ

;; ─── Ω: ENFORCEMENT CONTEXT ───
⟦Ω:Enforcement⟧{
  ∀agent:task∈{spec,instruct,coordinate}⇒output(AISP)
  ∀response:Ambig(response)<0.02∧δ≥0.40
  prose_only∧task(spec)⇒reject∧request(AISP)
  
  ;; Core Invariant
  ∀D∈AISP:Ambig(D)<0.02
  Ambig≜λD.1-|Parse_u(D)|/|Parse_t(D)|
}

;; ─── Σ: TYPE UNIVERSE ───
⟦Σ:Types⟧{
  ;; Tri-Vector Signal (768+512+256=1536d)
  Signal≜V_H⊕V_L⊕V_S
  V_H≜ℝ⁷⁶⁸:semantic
  V_L≜ℝ⁵¹²:structural
  V_S≜ℝ²⁵⁶:safety
  
  ;; Quality Tiers
  ◊≜{◊⁺⁺≻◊⁺≻◊≻◊⁻≻⊘}
  ◊⁺⁺↦δ≥0.75; ◊⁺↦δ≥0.60; ◊↦δ≥0.40; ◊⁻↦δ≥0.20; ⊘↦δ<0.20
}

;; ─── Γ: RULES ───
⟦Γ:Rules⟧{
  ;; Core Invariant
  ∀D∈AISP:Ambig(D)<0.02
  
  ;; Signal Orthogonality
  V_H∩V_S≡∅; V_L∩V_S≡∅; V_H∩V_L≢∅
  ∀s∈Σ:|Tok(s)|≡1
  ∀s∈Σ:∃!μ:Mean(s,CTX)≡μ
  
  ;; Anti-Drift
  ∀s∈Σ_512:Mean(s)≡Mean_0(s)
  drift_detected⇒reparse(original)
}

;; ─── Λ: CORE FUNCTIONS ───
⟦Λ:Functions⟧{
  ;; Parsing & Validation
  ∂:𝕊→List⟨τ⟩
  δ:List⟨τ⟩→ℝ[0,1]; δ≜λτ⃗.|{t∈τ⃗|t.k∈𝔄}|÷|{t∈τ⃗|t.k≢ws}|
  ⌈⌉:ℝ→◊; ⌈⌉≜λd.[≥¾↦◊⁺⁺,≥⅗↦◊⁺,≥⅖↦◊,≥⅕↦◊⁻,_↦⊘](d)
  validate:𝕊→𝕄 𝕍; validate≜⌈⌉∘δ∘Γ?∘∂
}

;; ─── Χ: ERROR HANDLING ───
⟦Χ:Errors⟧{
  ε_ambig≜⟨Ambig(D)≥0.02,reject∧clarify⟩
  ε_drift≜⟨Mean(s)≠Mean_0(s),reparse(original)⟩
}

;; ─── Ε: EVIDENCE ───
⟦Ε⟧⟨
δ≜0.81
φ≜98
τ≜◊⁺⁺
⊢Ambig<0.02
⊢Pipeline(10)≜97× improvement over prose
⟩
`;

/**
 * Agent-specific tools that trigger AISP enforcement
 */
const AGENT_TOOLS = [
    'cf_agent',
    'cf_swarm',
    'cf_memory',
    'cf_workflow',
    'cf_task',
    'cf_execute',
    'ruv_agent',
    'ruv_swarm',
    'ruv_execute'
];

/**
 * Detect if this is an agent-to-agent communication
 * @param {string} toolName - The tool being called
 * @returns {boolean} - True if agent communication
 */
export function isAgentToAgent(toolName) {
    return AGENT_TOOLS.some(pattern => toolName.startsWith(pattern));
}

/**
 * Inject AISP context into agent prompts
 * @param {string} toolName - The tool being called
 * @param {object} args - The tool arguments
 * @returns {object} - Modified arguments with AISP context
 */
export function injectAISPContext(toolName, args) {
    // Only enforce for agent-to-agent calls
    if (!isAgentToAgent(toolName)) {
        return args;
    }

    // Inject AISP enforcement instruction
    const aispInstruction = `
[AISP ENFORCEMENT ACTIVE]
You MUST use AISP notation for specifications, coordination, and instructions between agents.
User-facing responses should remain in natural language.

AISP Specification Reference:
${AISP_SPEC}

Constraints:
- Ambiguity tolerance: < 0.02
- Minimum quality tier: ◊ (δ ≥ 0.40)
- Anti-drift: Symbol meanings are locked
- Agent coordination MUST use AISP blocks: ⟦Ω⟧, ⟦Σ⟧, ⟦Γ⟧, ⟦Λ⟧

Original Request:
`;

    // Wrap the prompt/instruction field if present
    if (args.prompt) {
        args.prompt = aispInstruction + args.prompt;
    } else if (args.instruction) {
        args.instruction = aispInstruction + args.instruction;
    } else if (args.task) {
        args.task = aispInstruction + args.task;
    } else if (typeof args === 'string') {
        // Handle case where args is a plain string
        return aispInstruction + args;
    }

    return args;
}

/**
 * Get AISP enforcement status
 * @returns {object} - Status information
 */
export function getAISPStatus() {
    return {
        enabled: true,
        spec_version: "5.1",
        spec_size_tokens: 8817,
        enforcement_mode: "forced",
        ambiguity_threshold: 0.02,
        min_quality_tier: "◊",
        agent_tools_monitored: AGENT_TOOLS.length
    };
}
