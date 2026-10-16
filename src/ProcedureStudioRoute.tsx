import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './procedure-studio.css'

type ProcedureTemplate = {
  id: string
  workspace_id: string
  slug: string
  name: string
  work_type: string
  version: number
  description: string
  is_active: boolean
  published_at: string | null
  supersedes_template_id: string | null
}

type ProcedureStep = {
  id: string
  workspace_id: string
  template_id: string
  step_key: string
  section_key: string
  label: string
  description: string
  sequence: number
  required: boolean
}

type AnswerOption = { label: string; value: string }

type ProcedureCheck = {
  id: string
  workspace_id: string
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

type StepDraft = Pick<ProcedureStep, 'label' | 'section_key' | 'description' | 'required'>
type CheckDraft = {
  label: string
  description: string
  required: boolean
  check_type: string
  tool_key: string
  knowledge_scope: string
  evidence_required: boolean
  answer_kind: string
  answer_options_text: string
  problem_values_text: string
  activation_parent_key: string
  activation_values_text: string
}

const checkTypes = ['inspection', 'action', 'observation', 'decision', 'photo', 'measurement', 'timing', 'knowledge', 'part', 'qc']
const toolKeys = ['', 'photo', 'measurement', 'timing', 'knowledge', 'parts', 'research', 'diagnosis']
const answerKinds = ['status', 'choice', 'text']

function isProcedureStudio() {
  return window.location.hash.replace(/\/$/, '') === '#/procedures'
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function nextKey(value: string, fallback: string) {
  return slugify(value).replaceAll('-', '_') || fallback
}

function optionsToText(options: AnswerOption[]) {
  return options.map((option) => `${option.label}|${option.value}`).join('\n')
}

function textToOptions(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, rawValue] = line.split('|')
      const cleanLabel = label.trim()
      return { label: cleanLabel, value: (rawValue?.trim() || nextKey(cleanLabel, 'option')) }
    })
}

function csvToValues(text: string) {
  return text.split(',').map((value) => value.trim()).filter(Boolean)
}

function activationFields(rule: Record<string, unknown>) {
  const parent = typeof rule.parent_key === 'string' ? rule.parent_key : ''
  const values = Array.isArray(rule.values) ? rule.values.filter((value): value is string => typeof value === 'string') : []
  return { parent, values: values.join(', ') }
}

function emptyCheckDraft(): CheckDraft {
  return {
    label: '',
    description: '',
    required: true,
    check_type: 'inspection',
    tool_key: '',
    knowledge_scope: '',
    evidence_required: false,
    answer_kind: 'status',
    answer_options_text: '',
    problem_values_text: '',
    activation_parent_key: '',
    activation_values_text: '',
  }
}

export default function ProcedureStudioRoute() {
  const [active, setActive] = useState(isProcedureStudio)
  const [workspaceId, setWorkspaceId] = useState('')
  const [templates, setTemplates] = useState<ProcedureTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [steps, setSteps] = useState<ProcedureStep[]>([])
  const [checks, setChecks] = useState<ProcedureCheck[]>([])
  const [selectedStepId, setSelectedStepId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newWorkType, setNewWorkType] = useState('service')
  const [newDescription, setNewDescription] = useState('')
  const [stepDraft, setStepDraft] = useState<StepDraft>({ label: '', section_key: 'general', description: '', required: true })
  const [checkDraft, setCheckDraft] = useState<CheckDraft>(emptyCheckDraft())

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null
  const selectedStep = steps.find((step) => step.id === selectedStepId) ?? null
  const selectedStepChecks = useMemo(() => checks.filter((check) => check.template_step_id === selectedStepId).sort((a, b) => a.sequence - b.sequence), [checks, selectedStepId])
  const isDraft = Boolean(selectedTemplate && !selectedTemplate.published_at && !selectedTemplate.is_active)

  const families = useMemo(() => {
    const grouped = new Map<string, ProcedureTemplate[]>()
    for (const template of templates) {
      const list = grouped.get(template.slug) ?? []
      list.push(template)
      grouped.set(template.slug, list)
    }
    for (const list of grouped.values()) list.sort((a, b) => b.version - a.version)
    return Array.from(grouped.entries()).sort((a, b) => (a[1][0]?.name ?? a[0]).localeCompare(b[1][0]?.name ?? b[0]))
  }, [templates])

  useEffect(() => {
    const sync = () => setActive(isProcedureStudio())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      if (result.error || !result.data) {
        setMessage(`Procedure Studio unavailable: ${result.error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(result.data.id)
    })()
    return () => { cancelled = true }
  }, [active])

  async function loadTemplates(preferredId?: string) {
    if (!workspaceId) return
    setLoading(true)
    const result = await supabase
      .from('work_templates')
      .select('id,workspace_id,slug,name,work_type,version,description,is_active,published_at,supersedes_template_id')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true })
      .order('version', { ascending: false })
    setLoading(false)
    if (result.error) {
      setMessage(`Procedures could not be loaded: ${result.error.message}`)
      return
    }
    const next = (result.data ?? []) as ProcedureTemplate[]
    setTemplates(next)
    const requested = preferredId && next.some((template) => template.id === preferredId) ? preferredId : selectedTemplateId
    const fallback = next.find((template) => template.is_active)?.id ?? next[0]?.id ?? ''
    setSelectedTemplateId(requested && next.some((template) => template.id === requested) ? requested : fallback)
  }

  async function loadDefinition() {
    if (!workspaceId || !selectedTemplateId) {
      setSteps([])
      setChecks([])
      setSelectedStepId('')
      return
    }
    setLoading(true)
    const stepResult = await supabase
      .from('work_template_steps')
      .select('id,workspace_id,template_id,step_key,section_key,label,description,sequence,required')
      .eq('workspace_id', workspaceId)
      .eq('template_id', selectedTemplateId)
      .order('sequence', { ascending: true })
    if (stepResult.error) {
      setLoading(false)
      setMessage(`Procedure stages could not be loaded: ${stepResult.error.message}`)
      return
    }
    const nextSteps = (stepResult.data ?? []) as ProcedureStep[]
    const stepIds = nextSteps.map((step) => step.id)
    let nextChecks: ProcedureCheck[] = []
    if (stepIds.length > 0) {
      const checkResult = await supabase
        .from('work_template_step_checks')
        .select('id,workspace_id,template_step_id,check_key,label,description,sequence,required,check_type,tool_key,knowledge_scope,evidence_required,answer_kind,answer_options,activation_rule,problem_values')
        .eq('workspace_id', workspaceId)
        .in('template_step_id', stepIds)
        .order('sequence', { ascending: true })
      if (checkResult.error) {
        setLoading(false)
        setMessage(`Guided checks could not be loaded: ${checkResult.error.message}`)
        return
      }
      nextChecks = (checkResult.data ?? []) as ProcedureCheck[]
    }
    setLoading(false)
    setSteps(nextSteps)
    setChecks(nextChecks)
    setSelectedStepId((current) => nextSteps.some((step) => step.id === current) ? current : (nextSteps[0]?.id ?? ''))
    setMessage('')
  }

  useEffect(() => { if (workspaceId) void loadTemplates() }, [workspaceId])
  useEffect(() => { void loadDefinition() }, [workspaceId, selectedTemplateId])

  async function createProcedure() {
    if (!workspaceId || !newName.trim() || saving) return
    setSaving(true)
    const name = newName.trim()
    const slug = slugify(name)
    const result = await supabase.from('work_templates').insert({
      workspace_id: workspaceId,
      slug,
      name,
      work_type: newWorkType.trim() || 'service',
      version: 1,
      description: newDescription.trim(),
      is_active: false,
      published_at: null,
    }).select('id').single()
    setSaving(false)
    if (result.error) {
      setMessage(`Procedure could not be created: ${result.error.message}`)
      return
    }
    setCreating(false)
    setNewName('')
    setNewDescription('')
    setMessage('Draft procedure created. Add stages and checks, then publish when ready.')
    await loadTemplates(result.data.id)
  }

  async function cloneVersion() {
    if (!workspaceId || !selectedTemplate || saving) return
    setSaving(true)
    const result = await supabase.rpc('create_work_template_version', { p_workspace_id: workspaceId, p_template_id: selectedTemplate.id })
    setSaving(false)
    if (result.error) {
      setMessage(`New version could not be created: ${result.error.message}`)
      return
    }
    const newId = String(result.data)
    setMessage(`Version ${selectedTemplate.version + 1} created as a draft.`)
    await loadTemplates(newId)
  }

  async function publishVersion() {
    if (!workspaceId || !selectedTemplate || saving) return
    if (steps.length === 0) {
      setMessage('Add at least one stage before publishing this procedure.')
      return
    }
    setSaving(true)
    const result = await supabase.rpc('publish_work_template_version', { p_workspace_id: workspaceId, p_template_id: selectedTemplate.id })
    setSaving(false)
    if (result.error) {
      setMessage(`Procedure could not be published: ${result.error.message}`)
      return
    }
    setMessage(`Published ${selectedTemplate.name} v${selectedTemplate.version}. New Work can now use this version.`)
    await loadTemplates(selectedTemplate.id)
  }

  async function updateTemplateMeta(field: 'name' | 'work_type' | 'description', value: string) {
    if (!workspaceId || !selectedTemplate || !isDraft || saving) return
    setSaving(true)
    const result = await supabase.from('work_templates').update({ [field]: value }).eq('workspace_id', workspaceId).eq('id', selectedTemplate.id)
    setSaving(false)
    if (result.error) {
      setMessage(`Procedure could not be updated: ${result.error.message}`)
      return
    }
    await loadTemplates(selectedTemplate.id)
  }

  async function addStage() {
    if (!workspaceId || !selectedTemplate || !isDraft || !stepDraft.label.trim() || saving) return
    setSaving(true)
    const result = await supabase.from('work_template_steps').insert({
      workspace_id: workspaceId,
      template_id: selectedTemplate.id,
      step_key: `${nextKey(stepDraft.label, 'stage')}_${steps.length + 1}`,
      section_key: stepDraft.section_key.trim() || 'general',
      label: stepDraft.label.trim(),
      description: stepDraft.description.trim(),
      sequence: (steps.at(-1)?.sequence ?? 0) + 10,
      required: stepDraft.required,
    }).select('id').single()
    setSaving(false)
    if (result.error) {
      setMessage(`Stage could not be added: ${result.error.message}`)
      return
    }
    setStepDraft({ label: '', section_key: stepDraft.section_key || 'general', description: '', required: true })
    await loadDefinition()
    setSelectedStepId(result.data.id)
  }

  async function updateStage(stage: ProcedureStep, patch: Partial<ProcedureStep>) {
    if (!workspaceId || !isDraft || saving) return
    setSaving(true)
    const result = await supabase.from('work_template_steps').update(patch).eq('workspace_id', workspaceId).eq('id', stage.id)
    setSaving(false)
    if (result.error) setMessage(`Stage could not be updated: ${result.error.message}`)
    else await loadDefinition()
  }

  async function moveStage(stage: ProcedureStep, direction: -1 | 1) {
    if (!isDraft || saving) return
    const index = steps.findIndex((entry) => entry.id === stage.id)
    const other = steps[index + direction]
    if (!other) return
    setSaving(true)
    const first = await supabase.from('work_template_steps').update({ sequence: other.sequence }).eq('workspace_id', workspaceId).eq('id', stage.id)
    const second = first.error ? null : await supabase.from('work_template_steps').update({ sequence: stage.sequence }).eq('workspace_id', workspaceId).eq('id', other.id)
    setSaving(false)
    const error = first.error ?? second?.error
    if (error) setMessage(`Stage order could not be changed: ${error.message}`)
    else await loadDefinition()
  }

  async function deleteStage(stage: ProcedureStep) {
    if (!workspaceId || !isDraft || saving) return
    if (!window.confirm(`Delete “${stage.label}” and its guided checks?`)) return
    setSaving(true)
    const checkDelete = await supabase.from('work_template_step_checks').delete().eq('workspace_id', workspaceId).eq('template_step_id', stage.id)
    const stageDelete = checkDelete.error ? null : await supabase.from('work_template_steps').delete().eq('workspace_id', workspaceId).eq('id', stage.id)
    setSaving(false)
    const error = checkDelete.error ?? stageDelete?.error
    if (error) setMessage(`Stage could not be deleted: ${error.message}`)
    else await loadDefinition()
  }

  function editCheck(check: ProcedureCheck) {
    const activation = activationFields(check.activation_rule ?? {})
    setCheckDraft({
      label: check.label,
      description: check.description,
      required: check.required,
      check_type: check.check_type,
      tool_key: check.tool_key,
      knowledge_scope: check.knowledge_scope,
      evidence_required: check.evidence_required,
      answer_kind: check.answer_kind,
      answer_options_text: optionsToText(check.answer_options ?? []),
      problem_values_text: (check.problem_values ?? []).join(', '),
      activation_parent_key: activation.parent,
      activation_values_text: activation.values,
    })
  }

  function checkPayload(draft: CheckDraft) {
    const activationValues = csvToValues(draft.activation_values_text)
    return {
      label: draft.label.trim(),
      description: draft.description.trim(),
      required: draft.required,
      check_type: draft.check_type,
      tool_key: draft.tool_key,
      knowledge_scope: draft.knowledge_scope.trim(),
      evidence_required: draft.evidence_required,
      answer_kind: draft.answer_kind,
      answer_options: draft.answer_kind === 'choice' ? textToOptions(draft.answer_options_text) : [],
      problem_values: csvToValues(draft.problem_values_text),
      activation_rule: draft.activation_parent_key.trim() ? { parent_key: draft.activation_parent_key.trim(), values: activationValues } : {},
    }
  }

  async function addCheck() {
    if (!workspaceId || !selectedStep || !isDraft || !checkDraft.label.trim() || saving) return
    setSaving(true)
    const payload = checkPayload(checkDraft)
    const result = await supabase.from('work_template_step_checks').insert({
      workspace_id: workspaceId,
      template_step_id: selectedStep.id,
      check_key: `${nextKey(checkDraft.label, 'check')}_${selectedStepChecks.length + 1}`,
      sequence: (selectedStepChecks.at(-1)?.sequence ?? 0) + 10,
      ...payload,
    })
    setSaving(false)
    if (result.error) {
      setMessage(`Guided check could not be added: ${result.error.message}`)
      return
    }
    setCheckDraft(emptyCheckDraft())
    await loadDefinition()
  }

  async function updateCheck(check: ProcedureCheck, draft = checkDraft) {
    if (!workspaceId || !isDraft || saving || !draft.label.trim()) return
    setSaving(true)
    const result = await supabase.from('work_template_step_checks').update(checkPayload(draft)).eq('workspace_id', workspaceId).eq('id', check.id)
    setSaving(false)
    if (result.error) setMessage(`Guided check could not be updated: ${result.error.message}`)
    else {
      setCheckDraft(emptyCheckDraft())
      await loadDefinition()
    }
  }

  async function moveCheck(check: ProcedureCheck, direction: -1 | 1) {
    if (!isDraft || saving) return
    const index = selectedStepChecks.findIndex((entry) => entry.id === check.id)
    const other = selectedStepChecks[index + direction]
    if (!other) return
    setSaving(true)
    const first = await supabase.from('work_template_step_checks').update({ sequence: other.sequence }).eq('workspace_id', workspaceId).eq('id', check.id)
    const second = first.error ? null : await supabase.from('work_template_step_checks').update({ sequence: check.sequence }).eq('workspace_id', workspaceId).eq('id', other.id)
    setSaving(false)
    const error = first.error ?? second?.error
    if (error) setMessage(`Check order could not be changed: ${error.message}`)
    else await loadDefinition()
  }

  async function deleteCheck(check: ProcedureCheck) {
    if (!workspaceId || !isDraft || saving) return
    if (!window.confirm(`Delete “${check.label}”?`)) return
    setSaving(true)
    const result = await supabase.from('work_template_step_checks').delete().eq('workspace_id', workspaceId).eq('id', check.id)
    setSaving(false)
    if (result.error) setMessage(`Guided check could not be deleted: ${result.error.message}`)
    else await loadDefinition()
  }

  if (!active) return null

  return (
    <main className="procedure-studio-route">
      <header className="procedure-studio-hero">
        <div><p className="eyebrow">WORKSHOP INTELLIGENCE</p><h1>Procedure Studio</h1><p>Design the canonical workshop procedures that generate guided Work. Published versions stay stable; changes happen in a new draft version.</p></div>
        <button type="button" onClick={() => setCreating(true)}>＋ New procedure</button>
      </header>

      {message && <div className="procedure-studio-message">{message}</div>}

      {creating && <section className="procedure-studio-create">
        <div><span className="eyebrow">NEW PROCEDURE</span><strong>Create a draft</strong></div>
        <label>Name<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Crystal replacement" /></label>
        <label>Work type<input value={newWorkType} onChange={(event) => setNewWorkType(event.target.value)} placeholder="repair" /></label>
        <label className="wide">Description<textarea rows={2} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="What this procedure is for…" /></label>
        <div className="procedure-studio-create-actions"><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button><button type="button" onClick={() => void createProcedure()} disabled={saving || !newName.trim()}>{saving ? 'Creating…' : 'Create draft'}</button></div>
      </section>}

      <div className="procedure-studio-layout">
        <aside className="procedure-studio-library">
          <div className="procedure-studio-section-title"><div><span className="eyebrow">LIBRARY</span><strong>{families.length} procedure families</strong></div>{loading && <small>Loading…</small>}</div>
          <div className="procedure-family-list">
            {families.map(([slug, versions]) => <section key={slug} className="procedure-family">
              <div className="procedure-family-heading"><strong>{versions[0]?.name ?? slug}</strong><small>{versions[0]?.work_type}</small></div>
              {versions.map((template) => <button key={template.id} type="button" className={selectedTemplateId === template.id ? 'active' : ''} onClick={() => setSelectedTemplateId(template.id)}>
                <span>v{template.version}</span><strong>{template.is_active ? 'Active' : template.published_at ? 'Published' : 'Draft'}</strong><small>{template.published_at ? new Date(template.published_at).toLocaleDateString('en-AU') : 'Editable'}</small>
              </button>)}
            </section>)}
            {!loading && templates.length === 0 && <p className="muted">No procedures yet.</p>}
          </div>
        </aside>

        <section className="procedure-studio-editor">
          {!selectedTemplate ? <div className="procedure-studio-empty"><strong>Select or create a procedure</strong><p>The Studio keeps stages, guided checks, branching rules and versions together.</p></div> : <>
            <header className="procedure-editor-header">
              <div className="procedure-editor-title">
                <div className="procedure-status-line"><span className={selectedTemplate.is_active ? 'active' : isDraft ? 'draft' : 'published'}>{selectedTemplate.is_active ? 'ACTIVE' : isDraft ? 'DRAFT' : 'PUBLISHED'}</span><small>v{selectedTemplate.version} · {selectedTemplate.work_type}</small></div>
                <h2>{selectedTemplate.name}</h2>
                <p>{selectedTemplate.description || 'No procedure description yet.'}</p>
              </div>
              <div className="procedure-editor-actions">
                {!isDraft && <button type="button" className="secondary" onClick={() => void cloneVersion()} disabled={saving}>Clone to new version</button>}
                {isDraft && <button type="button" onClick={() => void publishVersion()} disabled={saving || steps.length === 0}>{saving ? 'Working…' : 'Publish version'}</button>}
              </div>
            </header>

            {isDraft ? <div className="procedure-meta-grid">
              <label>Name<input defaultValue={selectedTemplate.name} onBlur={(event) => void updateTemplateMeta('name', event.target.value.trim())} /></label>
              <label>Work type<input defaultValue={selectedTemplate.work_type} onBlur={(event) => void updateTemplateMeta('work_type', event.target.value.trim())} /></label>
              <label className="wide">Description<textarea rows={2} defaultValue={selectedTemplate.description} onBlur={(event) => void updateTemplateMeta('description', event.target.value.trim())} /></label>
            </div> : <div className="procedure-version-note">Published versions are read-only in Studio. Clone this version before changing its definition.</div>}

            <div className="procedure-definition-grid">
              <section className="procedure-stage-column">
                <div className="procedure-studio-section-title"><div><span className="eyebrow">STAGES</span><strong>{steps.length} procedure stages</strong></div></div>
                <div className="procedure-stage-list">
                  {steps.map((step, index) => <div key={step.id} className={`procedure-stage-row ${selectedStepId === step.id ? 'active' : ''}`}>
                    <button type="button" className="procedure-stage-select" onClick={() => setSelectedStepId(step.id)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{step.label}</strong><small>{checks.filter((check) => check.template_step_id === step.id).length} checks · {step.section_key}</small></div></button>
                    {isDraft && <div className="procedure-order-actions"><button type="button" className="ghost" onClick={() => void moveStage(step, -1)} disabled={index === 0 || saving}>↑</button><button type="button" className="ghost" onClick={() => void moveStage(step, 1)} disabled={index === steps.length - 1 || saving}>↓</button><button type="button" className="ghost danger" onClick={() => void deleteStage(step)} disabled={saving}>×</button></div>}
                  </div>)}
                </div>
                {isDraft && <div className="procedure-add-card">
                  <span className="eyebrow">ADD STAGE</span>
                  <label>Label<input value={stepDraft.label} onChange={(event) => setStepDraft((draft) => ({ ...draft, label: event.target.value }))} placeholder="Disassembly" /></label>
                  <label>Section key<input value={stepDraft.section_key} onChange={(event) => setStepDraft((draft) => ({ ...draft, section_key: event.target.value }))} /></label>
                  <label>Description<textarea rows={2} value={stepDraft.description} onChange={(event) => setStepDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
                  <label className="procedure-checkline"><input type="checkbox" checked={stepDraft.required} onChange={(event) => setStepDraft((draft) => ({ ...draft, required: event.target.checked }))} />Required stage</label>
                  <button type="button" onClick={() => void addStage()} disabled={saving || !stepDraft.label.trim()}>Add stage</button>
                </div>}
              </section>

              <section className="procedure-check-column">
                <div className="procedure-studio-section-title"><div><span className="eyebrow">GUIDED CHECKS</span><strong>{selectedStep?.label ?? 'Select a stage'}</strong></div>{selectedStep && <small>{selectedStepChecks.length} checks</small>}</div>
                {selectedStep && isDraft && <div className="procedure-stage-meta">
                  <label>Stage label<input value={selectedStep.label} onChange={(event) => setSteps((current) => current.map((step) => step.id === selectedStep.id ? { ...step, label: event.target.value } : step))} onBlur={(event) => void updateStage(selectedStep, { label: event.target.value.trim() })} /></label>
                  <label>Section<input value={selectedStep.section_key} onChange={(event) => setSteps((current) => current.map((step) => step.id === selectedStep.id ? { ...step, section_key: event.target.value } : step))} onBlur={(event) => void updateStage(selectedStep, { section_key: event.target.value.trim() || 'general' })} /></label>
                  <label className="wide">Description<textarea rows={2} value={selectedStep.description} onChange={(event) => setSteps((current) => current.map((step) => step.id === selectedStep.id ? { ...step, description: event.target.value } : step))} onBlur={(event) => void updateStage(selectedStep, { description: event.target.value.trim() })} /></label>
                </div>}

                <div className="procedure-check-list">
                  {selectedStepChecks.map((check, index) => {
                    const activation = activationFields(check.activation_rule ?? {})
                    return <article key={check.id} className="procedure-check-card">
                      <div className="procedure-check-card-head"><div><span>{String(index + 1).padStart(2, '0')}</span><strong>{check.label}</strong></div><em>{check.check_type}</em></div>
                      {check.description && <p>{check.description}</p>}
                      <div className="procedure-check-meta"><span>{check.answer_kind}</span>{check.required && <span>required</span>}{check.evidence_required && <span>evidence</span>}{check.tool_key && <span>{check.tool_key}</span>}{activation.parent && <span>if {activation.parent}</span>}</div>
                      {check.answer_kind === 'choice' && check.answer_options?.length > 0 && <div className="procedure-choice-preview">{check.answer_options.map((option) => <span key={option.value}>{option.label}</span>)}</div>}
                      {isDraft && <div className="procedure-card-actions"><button type="button" className="secondary small" onClick={() => editCheck(check)}>Load into editor</button><button type="button" className="ghost" onClick={() => void moveCheck(check, -1)} disabled={index === 0 || saving}>↑</button><button type="button" className="ghost" onClick={() => void moveCheck(check, 1)} disabled={index === selectedStepChecks.length - 1 || saving}>↓</button><button type="button" className="ghost danger" onClick={() => void deleteCheck(check)} disabled={saving}>Delete</button><button type="button" className="secondary small" onClick={() => void updateCheck(check)} disabled={saving || !checkDraft.label.trim() || checkDraft.label === check.label}>Save loaded edit</button></div>}
                    </article>
                  })}
                  {selectedStep && selectedStepChecks.length === 0 && <div className="procedure-studio-empty compact"><strong>No guided checks yet</strong><p>Add the first action, inspection or decision below.</p></div>}
                </div>

                {selectedStep && isDraft && <div className="procedure-check-editor">
                  <div><span className="eyebrow">CHECK EDITOR</span><strong>Add a check or load an existing one</strong></div>
                  <label className="wide">Label<input value={checkDraft.label} onChange={(event) => setCheckDraft((draft) => ({ ...draft, label: event.target.value }))} placeholder="Inspect barrel and mainspring" /></label>
                  <label className="wide">Description<textarea rows={2} value={checkDraft.description} onChange={(event) => setCheckDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
                  <label>Check type<select value={checkDraft.check_type} onChange={(event) => setCheckDraft((draft) => ({ ...draft, check_type: event.target.value }))}>{checkTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label>Answer type<select value={checkDraft.answer_kind} onChange={(event) => setCheckDraft((draft) => ({ ...draft, answer_kind: event.target.value }))}>{answerKinds.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label>Tool<select value={checkDraft.tool_key} onChange={(event) => setCheckDraft((draft) => ({ ...draft, tool_key: event.target.value }))}>{toolKeys.map((value) => <option key={value || 'none'} value={value}>{value || 'None'}</option>)}</select></label>
                  <label>Knowledge scope<input value={checkDraft.knowledge_scope} onChange={(event) => setCheckDraft((draft) => ({ ...draft, knowledge_scope: event.target.value }))} placeholder="barrel" /></label>
                  {checkDraft.answer_kind === 'choice' && <label className="wide">Choices <small>One per line: Label|value</small><textarea rows={4} value={checkDraft.answer_options_text} onChange={(event) => setCheckDraft((draft) => ({ ...draft, answer_options_text: event.target.value }))} placeholder={'Serviceable|serviceable\nWear present|wear'} /></label>}
                  <label className="wide">Problem values <small>Comma separated values that should be treated as a problem/finding.</small><input value={checkDraft.problem_values_text} onChange={(event) => setCheckDraft((draft) => ({ ...draft, problem_values_text: event.target.value }))} placeholder="wear, damage, uncertain" /></label>
                  <fieldset className="wide"><legend>Conditional branch</legend><label>Parent check key<input value={checkDraft.activation_parent_key} onChange={(event) => setCheckDraft((draft) => ({ ...draft, activation_parent_key: event.target.value }))} placeholder="repair_path" /></label><label>Activate for values<input value={checkDraft.activation_values_text} onChange={(event) => setCheckDraft((draft) => ({ ...draft, activation_values_text: event.target.value }))} placeholder="replace_part, needs_parts" /></label></fieldset>
                  <label className="procedure-checkline"><input type="checkbox" checked={checkDraft.required} onChange={(event) => setCheckDraft((draft) => ({ ...draft, required: event.target.checked }))} />Required</label>
                  <label className="procedure-checkline"><input type="checkbox" checked={checkDraft.evidence_required} onChange={(event) => setCheckDraft((draft) => ({ ...draft, evidence_required: event.target.checked }))} />Evidence required</label>
                  <div className="procedure-check-editor-actions"><button type="button" className="secondary" onClick={() => setCheckDraft(emptyCheckDraft())}>Clear editor</button><button type="button" onClick={() => void addCheck()} disabled={saving || !checkDraft.label.trim()}>{saving ? 'Saving…' : 'Add as new check'}</button></div>
                </div>}
              </section>
            </div>
          </>}
        </section>
      </div>
    </main>
  )
}
