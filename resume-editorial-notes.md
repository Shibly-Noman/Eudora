# Resume editorial notes

The LaTeX is a working editorial draft. Numbered markers identify proposed details that were not established in the original resume. Approval to continue editing does not verify these details. Retain only claims you can explain with a concrete example.

| Marker | What to verify or replace |
| --- | --- |
| 1 | Was FastAPI used for the RTM MVP? If not, name the actual framework or retain only the RAG MVP description. Expand RTM if the full name is appropriate to disclose. |
| 2 | Did you own the NLQ design and define the legacy-data integration? Identify one decision you made and why. Use “Contributed to” if design ownership was shared. |
| 3 | Were Azerion APIs built in Django, and did they support campaign/reporting workflows? Substitute the actual framework and workflow. Django and FastAPI appeared in your skills, but the original did not assign either to a job. |
| 4 | Did you maintain ingestion/transformation pipelines and improve their processing logic? Supply records/day or GB/day, plus comparable before/after runtime. If you only contributed, use that verb. |
| 5 | Were query optimization and Redis caching the actual changes? Use p95 only if measured; otherwise name the measure you have, or remove the numeric clause. |
| 6 | Name a service or feature you led, and confirm responsibility through release. Verify code review and mentoring separately; remove either if it did not happen. Informal mentoring counts when you can describe it. |
| 7 | Confirm CI/CD maintenance, Docker deployment work, and Terraform changes at this employer. Name the actual CI system and cloud if useful. Distinguish infrastructure you changed from infrastructure you merely used. |
| 8 | Confirm direct collaboration with Product, QA, and DevOps, as well as participation in design reviews. Retain only the teams and processes you worked with. |
| 9 | Supply a specific page, metric, and comparable before/after measurements. Remove this sentence if measurements are unavailable; the preceding qualitative improvement remains supported by your original resume. |

The header presents Senior Software Engineer as the target professional headline. Employment titles and dates remain as supplied. The summary uses “experience since 2021” because the listed employment periods do not establish more than five full years of employment.

The Vite bullet was removed because no backend connection was supplied. Frontend skills and older media work were condensed to give backend experience more space. The portfolio label now matches its URL. The tracking project description no longer makes an unsubstantiated legal-compliance claim.

For metrics, prefer logs, dashboards, benchmark results, tickets, or measurements you can reconstruct. Compare equivalent workloads and environments. If exact figures are confidential, use an approved range or relative improvement backed by the same evidence. Do not invent numbers to fill space.

Before submission, resolve each numbered claim, replace or remove bracketed placeholders, unwrap the confirmed `\proposed{number}{text}` calls to retain their text, and remove the editorial banner. Compile the LaTeX and inspect page count, wrapping, and links. No LaTeX compiler was available during this edit, so rendered layout is unverified.
