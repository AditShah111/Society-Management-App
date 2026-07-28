# Startup Architecture & GTM Standards

**Context**: This software is a proper startup SaaS application meant for a live Go-To-Market (GTM) launch. It is not an experimental side-project.

**Directives**:
1. **No Short-Term Hacks**: Never propose or implement short-term workarounds, "sandbox" hacks, or temporary fixes just to get something working for the day. 
2. **Foolproof & Long-Term**: All architectural choices, API integrations, and database schemas must be foolproof, scalable, and designed with a long-term horizon.
3. **Extreme Security**: Security is paramount. Never compromise on authentication, data isolation (especially since this is multi-tenant housing society software), or credential management.
4. **GTM Readiness**: Ensure that no technical decision hinders the GTM strategy (e.g. risking bans by violating API Terms of Service, hardcoding scalable logic, or using unofficial third-party APIs where official ones exist).
