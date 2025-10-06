# Auto Provisioning Service Open Questions

## Provider Coverage
- Which providers must the orchestrator support at launch beyond OpenAI (e.g., ElevenLabs, Google, Azure OpenAI)?
- Are there provider-specific restrictions on credential reuse or sub-accounts we must account for?
- Do we need regional endpoints or data residency guarantees for certain providers?

## Pricing & Packaging
- What token/usage quotas correspond to each premium tier, and how do overages price out?
- Should we support pay-as-you-go billing for heavy users in addition to subscriptions?
- How will promo codes, trials, or refunds interact with provisioning state (auto-disable vs grace period)?

## Compliance & Legal
- Are there jurisdictions requiring explicit consent or data processing agreements for billing/usage tracking?
- Do we need age verification or other policy gates before enabling provider access?
- What is the retention policy for usage events that may contain derived metadata about prompts?

## Technical Architecture
- Which secret management solution will back the credential vault (AWS KMS, GCP Secret Manager, HashiCorp Vault)?
- Will the provisioning service run on the same infrastructure as the main web app (Vercel) or move to a dedicated backend (AWS, Fly.io)?
- How do we expose real-time usage feedback (polling vs WebSocket vs SSE) without leaking sensitive usage data?
- Should we adopt a per-user proxy token or per-session token model, and how long should tokens remain valid?
- What Convex schema/functions are required to guarantee transactional writes for credentials and usage (e.g., versioning, concurrency controls)?

## Operational Processes
- What SLAs/SLOs must we meet for provisioning latency and availability?
- Which events require automated alerts (e.g., approaching quota, provider downtime, billing failure)?
- How will support teams trigger manual credential rotation or account suspension?

## Security Safeguards
- Do we need fraud detection or behavioural analytics to spot compromised accounts or shared logins?
- How often must master secrets rotate, and what dependencies exist with provider policies?
- Is additional audit logging needed for regulatory compliance (e.g., SOC 2, GDPR)?

## Integration Details
- What updates are required in the existing web UI to surface premium upsell, usage meters, and account management?
- Should the mobile/macOS apps integrate with the provisioning service later, and if so, how will sharing work across platforms?
- Are there API contracts or SDKs that partner teams need for reuse outside the main web client?
