---
name: security-review
description: Security-focused code review for vulnerabilities and best practices
---

# Security Review Guidelines

When reviewing code for security issues, focus on:

## Critical Security Checks

1. **Input Validation**
   - Check for SQL injection, XSS, and command injection vulnerabilities
   - Ensure all user inputs are validated and sanitized
   - Use parameterized queries and prepared statements

2. **Authentication & Authorization**
   - Verify proper access controls are in place
   - Check for broken authentication flows
   - Ensure sensitive operations require re-authentication

3. **Data Protection**
   - Sensitive data (passwords, tokens, PII) should never be logged
   - Check for proper encryption of data at rest and in transit
   - Ensure secrets are not hardcoded or committed to version control

4. **Error Handling**
   - Error messages should not expose internal implementation details
   - Stack traces should not be shown to end users in production
   - Proper logging of security-relevant events

## Reporting

- Provide specific line-number references for vulnerabilities
- Include CVSS severity assessment when applicable
- Suggest concrete fixes with code examples
- Reference OWASP Top 10 category when relevant
