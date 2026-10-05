import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import {LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer} from 'recharts'


function Dashboard() {
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchJobs = async () => {
            const { data, error } = await supabase
            .from('jobs')
            .select('*')

            if (error) {
            console.error('Failed to fetch jobs:', error)
            setLoading(false)
            return
            }

            setJobs(data ?? [])
            setLoading(false)
        }

        fetchJobs()
    }, [])

    const totalJobs = jobs.length

    const directJobs = jobs.filter(
    (job) => job.relevance === 'Direct'
    ).length

    const adjacentJobs = jobs.filter(
    (job) => job.relevance === 'Adjacent'
    ).length

    const exploreJobs = jobs.filter(
    (job) => job.relevance === 'Explore'
    ).length

    const jobTypeCounts: Record<string, number> = {}
    jobs.forEach((job) => {
    job.job_types?.forEach((type: string) => {
        jobTypeCounts[type] = (jobTypeCounts[type] || 0) + 1
    })
    })

    const topJobTypes = Object.entries(jobTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)

    const technologyCounts: Record<string, number> = {}
    jobs.forEach((job) => {
    job.technologies?.forEach((technology: string) => {
        technologyCounts[technology] =
        (technologyCounts[technology] || 0) + 1
    })
    })

    const topTechnologies = Object.entries(technologyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)

    const canDoCounts: Record<string, number> = {}
    jobs.forEach((job) => {
    if (job.can_do) {
        canDoCounts[job.can_do] =
        (canDoCounts[job.can_do] || 0) + 1
    }
    })

    const capabilityBreakdown = Object.entries(canDoCounts)

    const skillGapCounts: Record<string, number> = {}
    jobs.forEach((job) => {
    job.missing_skills?.forEach((skill: string) => {
        skillGapCounts[skill] =
        (skillGapCounts[skill] || 0) + 1
    })
    })

    const topSkillGaps = Object.entries(skillGapCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)

    const weeklyCounts: Record<string, number> = {}

    jobs.forEach((job) => {
    const date = new Date(job.created_at)
    // Get the start of the week (Monday)
    const day = date.getDay()
    const diff = day === 0 ? -6 : 1 - day
    date.setDate(date.getDate() + diff)
    const weekKey = date.toISOString().split('T')[0]
    weeklyCounts[weekKey] = (weeklyCounts[weekKey] || 0) + 1
    })

    const weeklyData = Object.entries(weeklyCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({
        week,
        label: new Date(`${week}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
        }),
        count
    }))


    if (loading) {
        return (
            <div className="dashboard-loading">
            <div className="loading-spinner"></div>

            <h2>Analyzing your market data</h2>

            <p>
                Gathering jobs, technologies, skill gaps, and trends...
            </p>
            </div>
        )
    }


    return (
        <main className="dashboard">
        <div className="container">

            <header className="dashboard-header">
            <h1>Market Recon</h1>
            <p>Your observed Upwork market at a glance.</p>
            </header>

            <section className="dashboard-section">
            <h2>Market Snapshot</h2>

            <div className="stat-grid">
                <div className="stat-card">
                <span>Jobs Recorded</span>
                <strong>{totalJobs}</strong>
                </div>

                <div className="stat-card">
                <span>Direct</span>
                <strong>{directJobs}</strong>
                </div>

                <div className="stat-card">
                <span>Adjacent</span>
                <strong>{adjacentJobs}</strong>
                </div>

                <div className="stat-card">
                <span>Explore</span>
                <strong>{exploreJobs}</strong>
                </div>
            </div>
            </section>

            <section className="dashboard-section">
                <div className="dashboard-grid">
                    <div className="dashboard-card">
                        <h2>Top Job Types</h2>

                        {topJobTypes.map(([type, count]) => (
                        <div key={type} className="stat-row">
                            <span>{type}</span>
                            <strong>{count}</strong>
                        </div>
                        ))}
                    </div>

                    <div className="dashboard-card">
                        <h2>Top Technologies</h2>

                        {topTechnologies.map(([technology, count]) => (
                        <div key={technology} className="stat-row">
                            <span>{technology}</span>
                            <strong>{count}</strong>
                        </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="dashboard-section">
                <div className="dashboard-grid">
                    <div className="dashboard-card">
                        <h2>Your Fit</h2>

                        {capabilityBreakdown.map(([capability, count]) => (
                        <div key={capability} className="stat-row">
                            <span>{capability}</span>
                            <strong>{count}</strong>
                        </div>
                        ))}
                    </div>

                    <div className="dashboard-card">
                        <h2>Skill Gaps</h2>

                        {topSkillGaps.map(([skill, count]) => (
                        <div key={skill} className="stat-row">
                            <span>{skill}</span>
                            <strong>{count}</strong>
                        </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="dashboard-section">
                <div className="dashboard-card weekly-chart">
                    <h2>Jobs Recorded by Week</h2>

                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line
                            type="monotone"
                            dataKey="count"
                            stroke="#2563eb"
                            strokeWidth={2}
                        />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </section>

        </div>
        </main>
    )
    }

export default Dashboard