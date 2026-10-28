# CyberShield AI

### Smarter Cybersecurity, Simplified

> **Detect the signals. Understand the risks. Act with confidence.**

CyberShield AI is a cybersecurity assistant concept designed to make
digital security more accessible, understandable, and actionable for
everyday users and developers. It brings security checks and AI-powered
explanations into one intuitive workspace, helping users understand
potential risks and decide what to do next.

## Overview

Cyber threats can be difficult to recognize, and technical security
reports are often difficult for non-experts to understand. CyberShield
AI aims to bridge that gap by combining practical security analysis with
clear, AI-assisted explanations and safer next-step guidance.

The project is being developed for **HackIndia AI & CyberTech Hackathon
2026** by **Ghost Corps**.

## Core Features

### 1. Phishing URL Analyzer

-   Accepts a URL for security-oriented inspection.
-   Looks for suspicious indicators that may suggest phishing or an
    unsafe destination.
-   Presents findings in a way users can understand.
-   Provides practical safety guidance when a URL appears suspicious.

**Important:** A URL check is an assessment, not a guarantee. A URL
marked as low risk may still be malicious, and users should avoid
entering passwords or payment details on sites they do not trust.

### 2. AI Security Co-Pilot

-   Explains technical findings in plain language.
-   Helps users understand why an indicator may matter.
-   Suggests sensible next steps instead of showing unexplained
    technical output.
-   Is intended to make cybersecurity information more approachable for
    beginners.

### 3. Code Vulnerability Detection

-   Helps review submitted code for selected common security weaknesses.
-   Explains potential issues and why they matter.
-   Suggests safer coding practices and possible remediations.

AI-generated code reviews can miss vulnerabilities or flag code that is
safe. Findings should be reviewed and tested by a developer before being
treated as definitive.

## Project Goals

-   Make cybersecurity easier to understand for non-experts.
-   Help users recognize suspicious URLs and common warning signs.
-   Turn technical findings into clear, actionable explanations.
-   Encourage safer coding practices.
-   Bring useful security workflows together in one workspace.

## How It Works

The intended user workflow is:

1.  **Choose a security task** --- inspect a URL or review code.
2.  **Submit the input** --- provide the URL or code snippet.
3.  **Analyze** --- run the relevant security checks.
4.  **Explain** --- present the findings with AI-assisted,
    plain-language context where configured.
5.  **Act** --- review recommended precautions or safer coding
    suggestions.

``` text
                 ┌─────────────────────┐
                 │       User          │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │  CyberShield AI UI  │
                 └──────────┬──────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
    ┌─────────▼─────────┐       ┌─────────▼─────────┐
    │ URL Security Check│       │ Code Security     │
    │                   │       │ Review            │
    └─────────┬─────────┘       └─────────┬─────────┘
              │                           │
              └─────────────┬─────────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Findings + AI       │
                 │ Explanation         │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Safer Next Steps    │
                 └─────────────────────┘
```

## AI Model/API Options

The project research has considered the following model/API options:

-   **NVIDIA Nemotron (Sparse)** --- a possible option for reasoning or
    assistant workflows, depending on the exact model and provider
    endpoint.
-   **MiniMax 3.1** --- a possible language-model option for
    explanations and assistant responses.
-   **DeepSeek V4** --- a possible option for code-oriented reasoning
    and security explanations, subject to actual model/API availability.
-   **GLM 5.3** --- a possible option for general reasoning and
    code-related assistance, subject to actual model/API availability.

These are **candidate integrations, not a claim that all four are
already connected or running**. Confirm the exact model identifiers,
provider documentation, supported features, context limits, pricing, and
availability before selecting one. Keep model access behind a
server-side integration layer so providers can be changed without
exposing credentials in the browser.

## Suggested Architecture

The exact production stack should reflect the code in the repository. A
sensible architecture for this project is:

-   **Frontend:** web interface for URL checks, code review, results,
    and explanations.
-   **Backend/API:** validates inputs, coordinates analysis, calls
    configured model providers, and returns structured results.
-   **Security analysis layer:** deterministic checks and carefully
    selected analysis services for URLs and code.
-   **AI explanation layer:** converts supported findings into
    plain-language summaries and recommendations.
-   **Configuration:** environment variables for API keys and provider
    settings.

Do not rely on an LLM alone to determine whether a URL is safe. Combine
model-assisted explanations with verifiable checks, and clearly
communicate uncertainty.

## Getting Started

> The repository's actual framework, commands, and file structure should
> be reflected here. The following is a general setup checklist; replace
> the example commands with the ones used by your project.

### Prerequisites

-   Git
-   The runtime and package manager required by the repository
-   API access for whichever model provider is actually configured
    (optional until AI integration is enabled)

### Setup

1.  Clone the repository:

    ``` bash
    git clone <YOUR_REPOSITORY_URL>
    cd <YOUR_PROJECT_FOLDER>
    ```

2.  Install dependencies using the package manager specified by the
    project. For example, if it is a Node.js project:

    ``` bash
    npm install
    ```

3.  Create a local environment file if the backend expects one:

    ``` bash
    cp .env.example .env
    ```

    On Windows, you can copy `.env.example` to `.env` using File
    Explorer if `cp` is unavailable.

4.  Add the required configuration values to `.env` locally. Use only
    the variable names documented by the application.

5.  Start the app using the command defined in `package.json`, the
    backend configuration, or the project documentation.

**Do not commit `.env` or real API keys to GitHub.** Ensure `.env` is
listed in `.gitignore`. If a key has already been pushed to a
repository, revoke or rotate it with the provider.

## Configuration and API-Key Safety

-   Store provider API keys on the server, never in frontend JavaScript
    or public repository files.
-   Use environment variables or a secrets manager.
-   Validate inputs and impose reasonable request-size and rate limits.
-   Avoid logging API keys, passwords, tokens, or sensitive submitted
    code.
-   Review each provider's data-retention and privacy terms before
    sending user input to it.
-   Do not execute user-submitted code as part of a scan.
-   If URL fetching is implemented on the backend, defend against
    server-side request forgery (SSRF): block private, loopback,
    link-local, and internal destinations; validate redirects; and
    restrict protocols and outbound access.
-   Treat submitted URLs, code, and model responses as untrusted input.

## Security and Privacy Notes

CyberShield AI is intended to support security awareness and defensive
analysis. It should not be treated as a replacement for professional
security review, endpoint protection, or incident-response procedures.

-   Do not enter real credentials, private keys, or confidential source
    code unless the service is designed and approved to handle them
    safely.
-   A scan result cannot guarantee that a URL or codebase is safe.
-   Review suggested code changes and run appropriate tests before
    applying them.
-   Display uncertainty clearly and avoid presenting AI-generated
    conclusions as verified facts.
-   Only analyze systems and code that you own or are authorized to
    test.

## Current Scope and Development Status

The project concept includes three main capabilities:

-   [ ] Phishing URL analysis
-   [ ] AI-powered security explanations
-   [ ] Code vulnerability review and safer coding suggestions

Mark a feature as complete only when it is implemented and tested in the
repository. Add screenshots, a live demo, a confirmed tech stack, and
exact setup commands when those are available.

## Team

**Team:** Ghost Corps\
**Project:** CyberShield AI\
**Event:** HackIndia AI & CyberTech Hackathon 2026

Add or update team member names and responsibilities here if you want
them shown publicly.

## Roadmap

-   [ ] Finalize and document the technology stack.
-   [ ] Implement URL input validation and security checks.
-   [ ] Add clear risk indicators with explanations and limitations.
-   [ ] Connect one server-side AI provider and document configuration.
-   [ ] Add code review with scoped vulnerability checks.
-   [ ] Add safer coding suggestions and developer-friendly
    explanations.
-   [ ] Test edge cases, failure handling, privacy protections, and API
    limits.
-   [ ] Add screenshots, demo instructions, and deployment details.

## Contributing

Contributions should improve defensive security, usability, reliability,
accessibility, or documentation.

1.  Create a branch for your change.
2.  Keep changes focused and explain their purpose.
3.  Test the affected feature.
4.  Never include secrets, real user credentials, or confidential code
    in commits.
5.  Submit a pull request with a concise description of the change.

## License

No license has been specified yet. Add a `LICENSE` file before
presenting the project as open source, and choose a license that fits
the team's intentions.

------------------------------------------------------------------------

**CyberShield AI --- Detect the signals. Understand the risks. Act with
confidence.**
