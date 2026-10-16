import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './procedure-preview.css'

type ProcedureTemplate = {
  id: string
  slug: string
  name: string
  work_type: string
  version: number
  is_active: boolean
  published_at: string | null
}

type ProcedureStep = {
  id: string
  template_id: string
  step_key: string
  label: string
  description: string
  sequence: number
  required: boolean
}

type AnswerOption = { label: string; value: string }

type ProcedureCheck = {
  id: string
  template_step_id: string
  check_key: string
  label: string
  description: string
  sequence: number
  required: boolean
  check_type: string
  tool_key: string
  knowledge_scope: string
  evidence_required: boolean
  answer_kind: string
  answer_options: AnswerOption[]
  activation_rule: Record<string, unknown>
  problem_values: string[]
}

type Diagnostic = { level: 'error' | 'warning'; text: string }

function onProcedureStudio() {
  return window.location.hash.replace(/\/$/, '') === '#/procedures'
}

function activation(rule: Record<string, unknown> | null | undefined) {
  const parentKey = typeof rule?.parent_key === 'string' ? rule.parent_key : ''
  const values = Array.isArray(rule?.values) ? rule.values.filter((value): value is string => typeof value === 'string') : []
  return { parentKey, values }
}

export default function ProcedurePreviewHost() {
  const [studioActive, setStudioActive] = useState(onProcedureStudio)
  const [open, setOpen] = useState(false)
  const [workspaceId, setWorkspaceId] = useState('')
  const [templates, setTemplates] = useState<ProcedureTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [steps, setSteps] = useState<ProcedureStep[]>([])
  const [checks, setChecks] = useState<ProcedureCheck[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const sync = () => {
      const active = onProcedureStudio()
      setStudioActive(active)
      if (!active) setOpen(false)
    }
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (!open || workspaceId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      setLoading(false)
      if (result.error || !result.data) {
        setMessage(`Preview unavailable: ${result.error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(result.data.id)
    })()
    return () => { cancelled = true }
  }, [open, workspaceId])

  useEffect(() => {
    if (!open || !workspaceId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const result = await supabase
        .from('work_templates')
        .select('id,slug,name,work_type,version,is_active,published_at')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
        .order('version', { ascending: false })
      if (cancelled) return
      setLoading(false)
      if (result.error) {
        setMessage(`Procedures could not be loaded: ${result.error.message}`)
        return
      }
      const next = (result.data ?? []) as ProcedureTemplate[]
      setTemplates(next)
      setTemplateId((current) => current && next.some((entry) => entry.id === current) ? current : (next.find((entry) => entry.is_active)?.id ?? next[0]?.id ?? ''))
    })()
    return () => { cancelled = true }
  }, [open, workspaceId])

  useEffect(() => {
    if (!open || !workspaceId || !templateId) {
      setSteps([])
      setChecks([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setAnswers({})
      const stepResult = await supabase
        .from('work_template_steps')
        .select('id,template_id,step_key,label,description,sequence,required')
        .eq('workspace_id', workspaceId)
        .eq('template_id', templateId)
        .order('sequence', { ascending: true })
      if (cancelled) return
      if (stepResult.error) {
        setLoading(false)
        setMessage(`Procedure stages could not be loaded: ${stepResult.error.message}`)
        return
      }
      const nextSteps = (stepResult.data ?? []) as ProcedureStep[]
      const ids = nextSteps.map((step) => step.id)
      let nextChecks: ProcedureCheck[] = []
      if (ids.length > 0) {
        const checkResult = await supabase
          .from('work_template_step_checks')
          .select('id,template_step_id,check_key,label,description,sequence,required,check_type,tool_key,knowledge_scope,evidence_required,answer_kind,answer_options,activation_rule,problem_values')
          .eq('workspace_id', workspaceId)
          .in('template_step_id', ids)
          .order('sequence', { ascending: true })
        if (cancelled) return
        if (checkResult.error) {
          setLoading(false)
          setMessage(`Guided checks could not be loaded: ${checkResult.error.message}`)
          return
        }
        nextChecks = (checkResult.data ?? []) as ProcedureCheck[]
      }
      setSteps(nextSteps)
      setChecks(nextChecks)
      setMessage('')
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, workspaceId, templateId])

  const selectedTemplate = templates.find((entry) => entry.id === templateId) ?? null
  const orderedChecks = useMemo(() => {
    const stageOrder = new Map(steps.map((step, index) => [step.id, index]))
    return [...checks].sort((a, b) => {
      const stageDelta = (stageOrder.get(a.template_step_id) ?? 999) - (stageOrder.get(b.template_step_id) ?? 999)
      return stageDelta || a.sequence - b.sequence
    })
  }, [steps, checks])

  const checkByKey = useMemo(() => {
    const map = new Map<string, ProcedureCheck>()
    for (const check of orderedChecks) if (!map.has(check.check_key)) map.set(check.check_key, check)
    return map
  }, [orderedChecks])

  function isCheckActive(check: ProcedureCheck) {
    const rule = activation(check.activation_rule)
    if (!rule.parentKey) return true
    if (!checkByKey.has(rule.parentKey)) return false
    const answer = answers[rule.parentKey]
    if (!answer) return false
    return rule.values.length === 0 || rule.values.includes(answer)
  }

  const diagnostics = useMemo<Diagnostic[]>(() => {
    const result: Diagnostic[] = []
    const seen = new Map<string, number>()
    orderedChecks.forEach((check) => seen.set(check.check_key, (seen.get(check.check_key) ?? 0) + 1))
    for (const [key, count] of seen) if (count > 1) result.push({ level: 'error', text: `Duplicate check key “${key}” appears ${count} times.` })

    const checkIndex = new Map(orderedChecks.map((check, index) => [check.check_key, index]))
    for (const check of orderedChecks) {
      if (check.answer_kind === 'choice' && (!check.answer_options || check.answer_options.length === 0)) {
        result.push({ level: 'error', text: `“${check.label}” is a choice check with no answer options.` })
      }
      const rule = activation(check.activation_rule)
      if (!rule.parentKey) continue
      const parent = checkByKey.get(rule.parentKey)
      if (!parent) {
        result.push({ level: 'error', text: `“${check.label}” branches from missing parent key “${rule.parentKey}”.` })
        continue
      }
      const parentPosition = checkIndex.get(parent.check_key) ?? -1
      const childPosition = checkIndex.get(check.check_key) ?? -1
      if (parentPosition >= childPosition) result.push({ level: 'warning', text: `“${check.label}” depends on “${parent.label}”, but the parent does not appear earlier in the procedure.` })
      if (parent.answer_kind === 'choice' && rule.values.length > 0) {
        const valid = new Set((parent.answer_options ?? []).map((option) => option.value))
        const invalid = rule.values.filter((value) => !valid.has(value))
        if (invalid.length) result.push({ level: 'error', text: `“${check.label}” uses branch value${invalid.length > 1 ? 's' : ''} ${invalid.join(', ')} not offered by “${parent.label}”.` })
      }
    }
    for (const step of steps) {
      const count = checks.filter((check) => check.template_step_id === step.id).length
      if (step.required && count === 0) result.push({ level: 'warning', text: `Required stage “${step.label}” has no guided checks.` })
    }
    return result
  }, [orderedChecks, checkByKey, steps, checks])

  const activeCount = orderedChecks.filter(isCheckActive).length
  const answeredCount = orderedChecks.filter((check) => isCheckActive(check) && Boolean(answers[check.check_key])).length
  const problemCount = orderedChecks.filter((check) => {
    const answer = answers[check.check_key]
    return isCheckActive(check) && Boolean(answer) && (check.problem_values ?? []).includes(answer)
  }).length

  function setAnswer(check: ProcedureCheck, value: string) {
    setAnswers((current) => {
      const next = { ...current, [check.check_key]: value }
      // Clear answers from descendants that are no longer active after this change.
      let changed = true
      while (changed) {
        changed = false
        for (const candidate of orderedChecks) {
          const rule = activation(candidate.activation_rule)
          if (!rule.parentKey || !next[candidate.check_key]) continue
          const parentAnswer = next[rule.parentKey]
          const active = Boolean(parentAnswer) && (rule.values.length === 0 || rule.values.includes(parentAnswer))
          if (!active) {
            delete next[candidate.check_key]
            changed = true
          }
        }
      }
      return next
    })
  }

  if (!studioActive) return null

  return <>
    {!open && <button type="button" className="procedure-preview-launcher" onClick={() => setOpen(true)}><span>▷</span><strong>Test procedure</strong></button>}
    {open && <div className="procedure-preview-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <section className="procedure-preview-shell" role="dialog" aria-modal="true" aria-label="Procedure test mode" onClick={(event) => event.stopPropagation()}>
        <header className="procedure-preview-header">
          <div><span className="eyebrow">TEST MODE · NOTHING IS SAVED</span><h2>Procedure Preview</h2><p>Run the branching logic without creating Work, findings, evidence or workshop history.</p></div>
          <button type="button" className="secondary" onClick={() => setOpen(false)}>Close</button>
        </header>

        <div className="procedure-preview-toolbar">
          <label>Procedure<select value={templateId} onChange={(event) => setTemplateId(event.target.value)} disabled={loading}>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}{template.is_active ? ' · Active' : template.published_at ? ' · Published' : ' · Draft'}</option>)}
          </select></label>
          <div className="procedure-preview-stats"><span><strong>{answeredCount}</strong> / {activeCount} active answered</span><span><strong>{problemCount}</strong> problem answers</span><span className={diagnostics.some((entry) => entry.level === 'error') ? 'bad' : 'good'}><strong>{diagnostics.length}</strong> logic issue{diagnostics.length === 1 ? '' : 's'}</span></div>
          <button type="button" className="secondary" onClick={() => setAnswers({})} disabled={Object.keys(answers).length === 0}>Reset answers</button>
        </div>

        {message && <div className="procedure-preview-message">{message}</div>}
        {loading && <div className="procedure-preview-loading">Loading procedure…</div>}

        {!loading && selectedTemplate && <div className="procedure-preview-body">
          {diagnostics.length > 0 && <details className="procedure-preview-diagnostics" open={diagnostics.some((entry) => entry.level === 'error')}>
            <summary>Logic check · {diagnostics.length} issue{diagnostics.length === 1 ? '' : 's'}</summary>
            <div>{diagnostics.map((entry, index) => <p key={`${entry.text}-${index}`} className={entry.level}><strong>{entry.level === 'error' ? 'ERROR' : 'CHECK'}</strong>{entry.text}</p>)}</div>
          </details>}

          <div className="procedure-preview-procedure-heading"><div><span className="eyebrow">SIMULATING</span><h3>{selectedTemplate.name}</h3></div><small>v{selectedTemplate.version} · {selectedTemplate.work_type}</small></div>

          {steps.map((step, stepIndex) => {
            const stageChecks = checks.filter((check) => check.template_step_id === step.id).sort((a, b) => a.sequence - b.sequence)
            const visible = stageChecks.filter(isCheckActive)
            const hidden = stageChecks.length - visible.length
            return <section key={step.id} className="procedure-preview-stage">
              <header><span>{String(stepIndex + 1).padStart(2, '0')}</span><div><strong>{step.label}</strong>{step.description && <small>{step.description}</small>}</div><em>{visible.length} active{hidden > 0 ? ` · ${hidden} hidden` : ''}</em></header>
              <div className="procedure-preview-checks">
                {visible.map((check) => {
                  const answer = answers[check.check_key] ?? ''
                  const isProblem = Boolean(answer) && (check.problem_values ?? []).includes(answer)
                  const rule = activation(check.activation_rule)
                  return <article key={check.id} className={`procedure-preview-check ${answer ? 'answered' : ''} ${isProblem ? 'problem' : ''}`}>
                    <div className="procedure-preview-check-title"><div><strong>{check.label}</strong><small>{check.check_type}{check.required ? ' · required' : ''}{check.evidence_required ? ' · evidence' : ''}{check.tool_key ? ` · ${check.tool_key}` : ''}</small></div>{rule.parentKey && <span>branch: {rule.parentKey}</span>}</div>
                    {check.description && <p>{check.description}</p>}
                    {check.answer_kind === 'choice' && <div className="procedure-preview-options">{(check.answer_options ?? []).map((option) => <button key={option.value} type="button" className={answer === option.value ? 'selected' : ''} onClick={() => setAnswer(check, option.value)}>{option.label}</button>)}</div>}
                    {check.answer_kind === 'text' && <textarea rows={2} value={answer} onChange={(event) => setAnswer(check, event.target.value)} placeholder="Type a test answer…" />}
                    {check.answer_kind === 'status' && <button type="button" className={answer === 'complete' ? 'procedure-preview-complete selected' : 'procedure-preview-complete'} onClick={() => setAnswer(check, answer === 'complete' ? '' : 'complete')}>{answer === 'complete' ? '✓ Complete' : 'Mark complete'}</button>}
                    {isProblem && <div className="procedure-preview-problem-note">This answer is configured as a problem value.</div>}
                  </article>
                })}
                {visible.length === 0 && <p className="procedure-preview-empty">No checks are active in this stage with the current answers.</p>}
              </div>
            </section>
          })}
        </div>}
      </section>
    </div>}
  </>
}
