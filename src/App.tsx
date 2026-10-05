import { useEffect, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { supabase } from './lib/supabase'
import './App.css'
import './Nav.css'
import Dashboard from './Dashboard.tsx'

/* ---------- options ---------- */

const RELEVANCE = ['Direct', 'Adjacent', 'Explore']
const NEEDS = [
  'Build API/backend',
  'Add backend feature',
  'Fix/debug backend',
  'Build SaaS/MVP',
  'Payment/billing integration',
  'AI integration',
  'Automation/workflows',
  'Database/data work',
  'Deployment/infrastructure',
  'Full-stack application',
  'Authentication',
  'Third-party API integration',
  'Other',
]
const TECH = [
  'Python',
  'FastAPI',
  'Django',
  'Flask',
  'PostgreSQL',
  'Redis',
  'Celery/background jobs',
  'Docker',
  'Node.js',
  'React',
  'Supabase',
  'AWS',
  'Stripe',
  'OpenAI/LLM',
  'Other',
]
const PAY_TYPE = ['Fixed price', 'Hourly']
const EXPERIENCE = ['Entry', 'Intermediate', 'Expert', 'Not specified']
const PROPOSALS = ['0-5', '5-10', '10-20', '20-50', '50+']
const CAN_DO = ['Yes', 'Mostly', 'Not yet']
const WOULD_APPLY = ['Yes', 'Maybe', 'No']

/* ---------- navigation ---------- */

type View = 'form' | 'dashboard'

const NAV_ITEMS: { id: View; label: string; icon: ReactNode }[] = [
  {
    id: 'form',
    label: 'Record job',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 20V10M12 20V4M19 20v-7" />
      </svg>
    ),
  },
]

/* ---------- form state ---------- */

type FormState = {
  title: string
  url: string
  relevance: string
  jobTypes: string[]
  technologies: string[]
  payType: string
  budgetMin: string
  budgetMax: string
  experienceLevel: string
  proposals: string
  canDo: string
  wouldApply: string
  missingSkills: string[]
  notes: string
}

const EMPTY: FormState = {
  title: '',
  url: '',
  relevance: '',
  jobTypes: [],
  technologies: [],
  payType: '',
  budgetMin: '',
  budgetMax: '',
  experienceLevel: '',
  proposals: '',
  canDo: '',
  wouldApply: '',
  missingSkills: [],
  notes: '',
}

// Required fields, in the order they appear on screen
const REQUIRED: { key: keyof FormState; message: string }[] = [
  { key: 'title', message: 'Add the job title' },
  { key: 'relevance', message: 'Pick one' },
  { key: 'jobTypes', message: 'Pick at least one' },
  { key: 'technologies', message: 'Pick at least one' },
  { key: 'payType', message: 'Fixed price or hourly?' },
  { key: 'experienceLevel', message: 'Pick one' },
  { key: 'canDo', message: 'Pick one' },
  { key: 'wouldApply', message: 'Pick one' },
]

const isEmpty = (v: string | string[]) => (Array.isArray(v) ? v.length === 0 : !v.trim())

// Adds typed technologies (comma separated allowed) to the list, skipping duplicates
function mergeTechs(current: string[], draft: string): string[] {
  const next = [...current]
  for (const raw of draft.split(',')) {
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, 30)
    if (name && !next.some((t) => t.toLowerCase() === name.toLowerCase())) next.push(name)
  }
  return next
}

/* ---------- missing skills: normalizing ---------- */

// "  Kubernetes. " -> "kubernetes"; collapses spaces, lowercases, trims stray punctuation
function normalizeSkill(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.,;:!?]+|[.,;:!?]+$/g, '')
    .trim()
    .slice(0, 40)
}

// Comparison key that ignores spacing and punctuation: "node js", "node.js", "nodejs" all match
const skillKey = (s: string) => s.replace(/[^a-z0-9+#]/g, '')

// Normalizes `raw`, then reuses an existing spelling if one matches once spacing/punctuation is ignored
function resolveSkill(raw: string, known: string[]): string {
  const name = normalizeSkill(raw)
  const key = skillKey(name)
  if (!key) return ''
  return known.find((k) => skillKey(k) === key) ?? name
}

// Adds one or more comma-separated skills to the list, resolved and de-duplicated
function mergeSkills(current: string[], raw: string, known: string[]): string[] {
  const next = [...current]
  for (const part of raw.split(',')) {
    const skill = resolveSkill(part, [...next, ...known])
    if (skill && !next.includes(skill)) next.push(skill)
  }
  return next
}

type Errors = Partial<Record<keyof FormState, string>>

// Returns '' for empty (URL is optional), a clean https URL, or null if invalid.
// Accepts links pasted without "https://".
function normalizeUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return ''
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withProtocol)
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

// Accepts 1500, 1,500, $1500, 45.50. Returns a number, null for empty, NaN for invalid.
function toAmount(raw: string): number | null {
  const value = raw.replace(/[,$\s]/g, '')
  if (!value) return null
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN
}

function urlErrors(url: string): Errors {
  return normalizeUrl(url) === null ? { url: 'That does not look like a valid link' } : { url: undefined }
}

function budgetErrors(min: string, max: string): Errors {
  const a = toAmount(min)
  const b = toAmount(max)
  return {
    budgetMin: Number.isNaN(a) ? 'Numbers only, like 500 or 45.50' : undefined,
    budgetMax: Number.isNaN(b)
      ? 'Numbers only, like 500 or 45.50'
      : a !== null && b !== null && !Number.isNaN(a) && a > b
        ? 'Max must be at least the min'
        : undefined,
  }
}

/* ---------- small building blocks ---------- */

function Field(props: {
  id: string
  label: string
  required?: boolean
  error?: string
  htmlFor?: string
  children: ReactNode
}) {
  const { id, label, required, error, htmlFor, children } = props
  const Label = htmlFor ? 'label' : 'span'
  return (
    <div className={`field${error ? ' has-error' : ''}`} id={`field-${id}`}>
      <Label className="label" {...(htmlFor ? { htmlFor } : {})}>
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
      </Label>
      {children}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  )
}

// Pick exactly one option
function Segmented(props: { options: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="pills" role="radiogroup" aria-label={props.label}>
      {props.options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={props.value === opt}
          className={`pill${props.value === opt ? ' on' : ''}`}
          onClick={() => props.onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// Pick any number of options
function Chips(props: { options: string[]; values: string[]; onChange: (v: string[]) => void; label: string }) {
  const toggle = (opt: string) =>
    props.onChange(props.values.includes(opt) ? props.values.filter((v) => v !== opt) : [...props.values, opt])
  return (
    <div className="pills" role="group" aria-label={props.label}>
      {props.options.map((opt) => (
        <button
          key={opt}
          type="button"
          aria-pressed={props.values.includes(opt)}
          className={`pill${props.values.includes(opt) ? ' on' : ''}`}
          onClick={() => toggle(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

/* ---------- app ---------- */

function App() {
  const [view, setView] = useState<View>('form')
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [techDraft, setTechDraft] = useState('')

  // Missing-skills autocomplete: skill -> how many saved jobs mention it
  const [skillCounts, setSkillCounts] = useState<Record<string, number>>({})
  const [skillDraft, setSkillDraft] = useState('')
  const [skillOpen, setSkillOpen] = useState(false)
  const [skillActive, setSkillActive] = useState(-1)

  // Runs once when the form loads: gather every saved missing skill and count them
  useEffect(() => {
    let cancelled = false
    async function loadSkills() {
      const { data, error } = await supabase.from('jobs').select('missing_skills')
      if (error) {
        console.error(error) // autocomplete just starts empty; the form still works
        return
      }
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        if (!Array.isArray(row.missing_skills)) continue
        for (const raw of row.missing_skills) {
          const skill = normalizeSkill(String(raw))
          if (skill) counts[skill] = (counts[skill] ?? 0) + 1
        }
      }
      if (!cancelled) setSkillCounts(counts)
    }
    loadSkills()
    return () => {
      cancelled = true
    }
  }, [])

  // known skills, most common first (so the most common spelling wins when two are near-identical)
  const knownSkills = Object.keys(skillCounts).sort((a, b) => skillCounts[b] - skillCounts[a])

  const skillQuery = normalizeSkill(skillDraft)
  const skillQueryKey = skillKey(skillQuery)
  const skillMatches = knownSkills
    .filter(
      (name) =>
        !form.missingSkills.includes(name) &&
        (!skillQuery || name.includes(skillQuery) || (skillQueryKey && skillKey(name).includes(skillQueryKey)))
    )
    .sort((a, b) => Number(b.startsWith(skillQuery)) - Number(a.startsWith(skillQuery))) // stable: keeps popularity order
    .slice(0, 6)
  const skillExists =
    !!skillQueryKey && [...knownSkills, ...form.missingSkills].some((name) => skillKey(name) === skillQueryKey)
  const skillOptions = [
    ...skillMatches.map((value) => ({ value, isNew: false })),
    ...(skillQueryKey && !skillExists ? [{ value: skillQuery, isNew: true }] : []),
  ]
  const showSkillList = skillOpen && skillOptions.length > 0

  function addSkills(raw: string) {
    set('missingSkills', mergeSkills(form.missingSkills, raw, knownSkills))
    setSkillDraft('')
    setSkillActive(-1)
  }

  function removeSkill(skill: string) {
    set('missingSkills', form.missingSkills.filter((s) => s !== skill))
  }

  function handleSkillKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSkillOpen(true)
      setSkillActive((i) => (skillOptions.length ? (i + 1) % skillOptions.length : -1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSkillActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault() // never submit the form from here
      const picked = skillOptions[skillActive]
      if (picked) addSkills(picked.value)
      else if (skillDraft.trim()) addSkills(skillDraft)
    } else if (e.key === 'Escape') {
      setSkillOpen(false)
    } else if (e.key === 'Backspace' && !skillDraft && form.missingSkills.length > 0) {
      removeSkill(form.missingSkills[form.missingSkills.length - 1])
    }
  }

  const otherOpen = form.technologies.includes('Other')
  const customTechs = form.technologies.filter((t) => !TECH.includes(t))

  function addCustomTech() {
    if (!techDraft.trim()) return
    set('technologies', mergeTechs(form.technologies, techDraft))
    setTechDraft('')
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const doneCount = REQUIRED.filter((r) => !isEmpty(form[r.key] as string | string[])).length

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (isSubmitting) return

    setSubmitError('')
    setSubmitSuccess('')

    // validate, show errors inline, jump to the first problem
    const found: Errors = { ...urlErrors(form.url), ...budgetErrors(form.budgetMin, form.budgetMax) }
    for (const r of REQUIRED) {
      if (isEmpty(form[r.key] as string | string[])) found[r.key] = r.message
    }
    // first problem in on-screen order
    const order: (keyof FormState)[] = [
      'title', 'url', 'relevance', 'jobTypes', 'technologies', 'payType', 'budgetMin', 'budgetMax',
      'experienceLevel', 'canDo', 'wouldApply',
    ]
    const firstKey = order.find((k) => found[k])
    if (firstKey) {
      setErrors(found)
      const target = firstKey === 'budgetMin' || firstKey === 'budgetMax' ? 'budget' : firstKey
      document.getElementById(`field-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setErrors({})

    setIsSubmitting(true)
    try {
      // include anything typed but not yet added; drop the "Other" placeholder once real names exist
      const allTechs = mergeTechs(form.technologies, techDraft)
      const savedTechs = allTechs.some((t) => !TECH.includes(t)) ? allTechs.filter((t) => t !== 'Other') : allTechs

      // include a skill that was typed but not yet added
      const savedSkills = mergeSkills(form.missingSkills, skillDraft, knownSkills)

      const job = {
        title: form.title.trim(),
        url: normalizeUrl(form.url) ?? '',
        relevance: form.relevance,
        job_types: form.jobTypes,
        technologies: savedTechs,
        job_type: form.payType,
        budget_min: toAmount(form.budgetMin),
        budget_max: toAmount(form.budgetMax),
        experience_level: form.experienceLevel,
        proposals: form.proposals,
        can_do: form.canDo,
        would_apply: form.wouldApply,
        missing_skills: savedSkills,
        notes: form.notes.trim(),
      }

      const { error } = await supabase.from('jobs').insert([job])

      if (error) {
        console.error(error)
        setSubmitError('Could not save this job. Check your connection and try again.')
        return
      }

      setSubmitSuccess('Job saved. Ready for the next one.')
      setSkillCounts((prev) => {
        const next = { ...prev }
        for (const skill of savedSkills) next[skill] = (next[skill] ?? 0) + 1
        return next
      })
      setForm(EMPTY)
      setTechDraft('')
      setSkillDraft('')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.setTimeout(() => setSubmitSuccess(''), 5000)
    } catch (error) {
      console.error(error)
      setSubmitError('Something unexpected went wrong. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const payLabel = form.payType === 'Hourly' ? 'Hourly rate ($)' : 'Budget ($)'

  function goTo(next: View) {
    setView(next)
    window.scrollTo({ top: 0 })
  }

  return (
    <>
      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          <span className="nav-brand">
            <span className="nav-logo" aria-hidden="true" />
            Upwork research
          </span>

          <div className="nav-links">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-link${view === item.id ? ' active' : ''}`}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => goTo(item.id)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {view === 'dashboard' ? (
        <Dashboard />
      ) : (
        <div className="app">
          <div className="container">
            <header className="header">
              <h1>Record a job</h1>
              <p>Capture useful market data from Upwork jobs</p>
            </header>

            {submitSuccess && <div className="banner success" role="status">{submitSuccess}</div>}

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-card">
                <section className="form-section">
                  <h2>Job</h2>

                  <Field id="title" label="Job title" required htmlFor="title" error={errors.title}>
                    <input
                      id="title"
                      type="text"
                      autoComplete="off"
                      value={form.title}
                      onChange={(e) => set('title', e.target.value)}
                    />
                  </Field>

                  <Field id="url" label="Job URL" htmlFor="url" error={errors.url}>
                    <input
                      id="url"
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Paste the link"
                      value={form.url}
                      onChange={(e) => set('url', e.target.value)}
                      onBlur={() => setErrors((e) => ({ ...e, ...urlErrors(form.url) }))}
                    />
                  </Field>

                  <Field id="relevance" label="How relevant is it to you?" required error={errors.relevance}>
                    <Segmented label="Relevance" options={RELEVANCE} value={form.relevance} onChange={(v) => set('relevance', v)} />
                  </Field>
                </section>

                <section className="form-section">
                  <h2>What they need</h2>
                  <Field id="jobTypes" label="Pick all that apply" required error={errors.jobTypes}>
                    <Chips label="What they need" options={NEEDS} values={form.jobTypes} onChange={(v) => set('jobTypes', v)} />
                  </Field>
                </section>

                <section className="form-section">
                  <h2>Technology</h2>
                  <Field id="technologies" label="Pick all that apply" required error={errors.technologies}>
                    <Chips label="Technology" options={TECH} values={form.technologies} onChange={(v) => set('technologies', v)} />

                    {customTechs.length > 0 && (
                      <div className="pills custom-row">
                        {customTechs.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className="pill on"
                            aria-label={`Remove ${t}`}
                            onClick={() => set('technologies', form.technologies.filter((x) => x !== t))}
                          >
                            {t} <span aria-hidden="true">×</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {otherOpen && (
                      <div className="tech-add">
                        <input
                          type="text"
                          autoFocus
                          autoComplete="off"
                          maxLength={60}
                          placeholder="Type a technology, press Enter"
                          aria-label="Add another technology"
                          value={techDraft}
                          onChange={(e) => setTechDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault() // don't submit the whole form
                              addCustomTech()
                            }
                          }}
                        />
                        <button type="button" className="add-button" onClick={addCustomTech}>
                          Add
                        </button>
                      </div>
                    )}
                  </Field>
                </section>

                <section className="form-section">
                  <h2>Pay and competition</h2>

                  <Field id="payType" label="Pay type" required error={errors.payType}>
                    <Segmented label="Pay type" options={PAY_TYPE} value={form.payType} onChange={(v) => set('payType', v)} />
                  </Field>

                  {form.payType && (
                    <Field id="budget" label={payLabel} error={errors.budgetMin ?? errors.budgetMax}>
                      <div className="range">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="Min"
                          aria-label={`${payLabel} minimum`}
                          aria-invalid={!!errors.budgetMin}
                          className={errors.budgetMin ? 'invalid' : ''}
                          value={form.budgetMin}
                          onChange={(e) => set('budgetMin', e.target.value)}
                          onBlur={() => setErrors((e) => ({ ...e, ...budgetErrors(form.budgetMin, form.budgetMax) }))}
                        />
                        <span aria-hidden="true">to</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="Max"
                          aria-label={`${payLabel} maximum`}
                          aria-invalid={!!errors.budgetMax}
                          className={errors.budgetMax ? 'invalid' : ''}
                          value={form.budgetMax}
                          onChange={(e) => set('budgetMax', e.target.value)}
                          onBlur={() => setErrors((e) => ({ ...e, ...budgetErrors(form.budgetMin, form.budgetMax) }))}
                        />
                      </div>
                    </Field>
                  )}

                  <Field id="experienceLevel" label="Experience level" required error={errors.experienceLevel}>
                    <Segmented label="Experience level" options={EXPERIENCE} value={form.experienceLevel} onChange={(v) => set('experienceLevel', v)} />
                  </Field>

                  <Field id="proposals" label="Proposals so far">
                    <Segmented label="Proposals" options={PROPOSALS} value={form.proposals} onChange={(v) => set('proposals', v)} />
                  </Field>
                </section>

                <section className="form-section">
                  <h2>Your take</h2>

                  <Field id="canDo" label="Can I do this?" required error={errors.canDo}>
                    <Segmented label="Can I do this" options={CAN_DO} value={form.canDo} onChange={(v) => set('canDo', v)} />
                  </Field>

                  <Field id="wouldApply" label="Would I apply?" required error={errors.wouldApply}>
                    <Segmented label="Would I apply" options={WOULD_APPLY} value={form.wouldApply} onChange={(v) => set('wouldApply', v)} />
                  </Field>

                  <Field id="missingSkills" label="Skills I'm missing" htmlFor="missingSkills">
                    {form.missingSkills.length > 0 && (
                      <div className="pills skill-chips">
                        {form.missingSkills.map((skill) => (
                          <button
                            key={skill}
                            type="button"
                            className="pill on"
                            aria-label={`Remove ${skill}`}
                            onClick={() => removeSkill(skill)}
                          >
                            {skill} <span aria-hidden="true">×</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="combo">
                      <input
                        id="missingSkills"
                        type="text"
                        role="combobox"
                        aria-expanded={showSkillList}
                        aria-controls="skill-list"
                        aria-autocomplete="list"
                        aria-activedescendant={skillActive >= 0 ? `skill-opt-${skillActive}` : undefined}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={60}
                        placeholder={form.missingSkills.length ? 'Add another...' : 'Type a skill, e.g. kubernetes'}
                        value={skillDraft}
                        onChange={(e) => {
                          const value = e.target.value
                          setSkillOpen(true)
                          setSkillActive(-1)
                          if (value.includes(',')) addSkills(value) // comma = "add this one"
                          else setSkillDraft(value)
                        }}
                        onFocus={() => setSkillOpen(true)}
                        onBlur={() => setSkillOpen(false)}
                        onKeyDown={handleSkillKeyDown}
                      />

                      {showSkillList && (
                        <ul className="combo-list" id="skill-list" role="listbox">
                          {!skillQuery && <li className="combo-hint" role="presentation">Most common so far</li>}
                          {skillOptions.map((opt, i) => (
                            <li
                              key={opt.value + (opt.isNew ? ':new' : '')}
                              id={`skill-opt-${i}`}
                              role="option"
                              aria-selected={i === skillActive}
                              className={`combo-option${i === skillActive ? ' active' : ''}${opt.isNew ? ' new' : ''}`}
                              onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                              onClick={() => addSkills(opt.value)}
                            >
                              {opt.isNew ? (
                                <span>Add new: “{opt.value}”</span>
                              ) : (
                                <>
                                  <span>{opt.value}</span>
                                  <span className="combo-count">{skillCounts[opt.value]}×</span>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Field>

                  <Field id="notes" label="Notes" htmlFor="notes">
                    <textarea
                      id="notes"
                      rows={2}
                      placeholder="Anything else worth remembering"
                      value={form.notes}
                      onChange={(e) => set('notes', e.target.value)}
                    />
                  </Field>
                </section>
              </div>

              <div className="save-bar">
                <div className="save-inner">
                  {submitError && <p className="save-error" role="alert">{submitError}</p>}
                  <div className="save-row">
                    <span className="progress" aria-live="polite">
                      {doneCount} of {REQUIRED.length} required
                    </span>
                    <button className="submit-button" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving...' : 'Save job'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      
          

      )}
    </>
  )
}

export default App