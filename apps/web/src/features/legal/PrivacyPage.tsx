import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { paths } from "../../routing/paths";

export function PrivacyPage() {
  return (
    <div className="privacy-page">
      <header className="privacy-header">
        <Link className="privacy-brand" to={paths.landing} aria-label="RGHS1 home">
          <ShieldCheck aria-hidden="true" />
          <span>RGHS1</span>
        </Link>
        <Link className="privacy-home-link" to={paths.landing}>
          Back to home
        </Link>
      </header>

      <main className="privacy-content">
        <div className="privacy-heading">
          <p className="eyebrow">RGHS1 Apply Assistant</p>
          <h1>Privacy Policy</h1>
          <p className="privacy-effective-date">Effective August 3, 2026</p>
          <p>
            This policy explains how RGHS1 Apply Assistant (the “Extension”) handles information
            when an authorized RGHS1 workspace member uses it to review a job posting, generate a
            tailored résumé, prepare application form values, and save an application record.
          </p>
        </div>

        <section className="privacy-section">
          <h2>Information the Extension handles</h2>
          <p>The Extension may handle the following information when you use its features:</p>
          <ul>
            <li>
              <strong>RGHS1 profile and application information:</strong> name, email address,
              telephone number, address, work history, skills, résumé content, profile selections,
              and other information used to prepare an application.
            </li>
            <li>
              <strong>Authentication information:</strong> an RGHS1 extension connection token,
              token identifier, expiration information, workspace context, and API origin.
            </li>
            <li>
              <strong>User-selected website information:</strong> the URL, title, visible job text,
              job metadata, links, application field labels, options, buttons, and related content
              from the active page that you ask the Extension to analyze.
            </li>
            <li>
              <strong>Generated and reviewed content:</strong> tailored résumé versions, field
              mappings, suggested application answers, revision instructions, review warnings, and
              the values you approve for autofill.
            </li>
            <li>
              <strong>Operational information:</strong> request status, timestamps, error details,
              and ordinary server logs needed to operate, secure, and troubleshoot the service.
            </li>
          </ul>
          <p>
            The Extension does not continuously monitor your browsing. It analyzes a page only when
            you invoke the Apply Assistant workflow. It is not designed to collect health,
            financial, payment, precise location, or private communications data.
          </p>
        </section>

        <section className="privacy-section">
          <h2>How information is used</h2>
          <p>RGHS1 uses the information described above only to:</p>
          <ul>
            <li>validate and maintain your connection to an authorized RGHS1 workspace;</li>
            <li>extract and organize details from the job page you selected;</li>
            <li>generate, review, and revise a résumé relevant to that job;</li>
            <li>map profile or generated information to detected application fields;</li>
            <li>fill fields only after you request autofill;</li>
            <li>create or update the application record you choose to save in RGHS1; and</li>
            <li>maintain security, prevent abuse, diagnose errors, and improve those features.</li>
          </ul>
          <p>
            The Extension does not independently click a job site’s final submit button. You remain
            responsible for reviewing the application and submitting it.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Local and server storage</h2>
          <p>
            Chrome local storage holds the RGHS1 connection token, API origin, workspace context,
            selected profile and job market, and Extension preferences. You can remove this local
            information by clearing the Extension’s storage or uninstalling the Extension.
          </p>
          <p>
            The connected RGHS1 workspace may store apply sessions, extracted job information,
            generated résumé versions, field mappings, saved bid or application records, and related
            operational data. Connection tokens remain usable until they expire or are revoked.
            Other records are retained as needed to provide the workspace service, satisfy security
            or legal requirements, and maintain records requested by the workspace.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Service providers and data sharing</h2>
          <p>
            RGHS1 does not sell user data or share it for personalized advertising, data brokerage,
            creditworthiness, or lending. Information may be processed by service providers only
            where necessary to operate or secure the Extension’s disclosed features. Current service
            categories include:
          </p>
          <ul>
            <li>
              <strong>Cloudflare:</strong> API hosting and file or résumé storage;
            </li>
            <li>
              <strong>Supabase:</strong> authentication, workspace data, and database services;
            </li>
            <li>
              <strong>OpenAI and Google Gemini:</strong> configured AI processing for job analysis,
              field mapping, application suggestions, résumé generation, and quality checks.
            </li>
          </ul>
          <p>
            Information may also be disclosed when required by law, to protect users and the service
            from fraud or abuse, or as part of a business transaction where legally permitted and
            subject to required notice or consent.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Security</h2>
          <p>
            Production and development API communication uses HTTPS. RGHS1 limits Extension tokens
            to the connected workspace context and supports token expiration and revocation. No
            method of transmission or storage is completely secure, but RGHS1 uses reasonable
            safeguards appropriate to the information handled by the service.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Your choices</h2>
          <ul>
            <li>Do not invoke the Extension on a page you do not want it to analyze.</li>
            <li>Review generated résumé and autofill values before using them.</li>
            <li>Revoke an Extension token from your RGHS1 workspace account.</li>
            <li>Clear the Extension’s local storage or uninstall it.</li>
            <li>
              Contact your RGHS1 workspace administrator to request access, correction, export, or
              deletion of workspace records, subject to applicable requirements.
            </li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>Chrome Web Store Limited Use</h2>
          <p>
            RGHS1’s use of information received from Chrome APIs complies with the Chrome Web Store
            User Data Policy, including the Limited Use requirements. Data obtained through the
            Extension is used and transferred only as necessary to provide or improve its disclosed
            job-application assistance features, maintain security, comply with law, or support
            another use permitted by that policy.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Changes and contact</h2>
          <p>
            This policy may be updated when the Extension’s features, service providers, or legal
            requirements change. Material changes will be reflected on this page and, when required,
            disclosed in the Extension or Chrome Web Store listing before the changed practice
            begins.
          </p>
          <p>
            For privacy questions or requests, contact your RGHS1 workspace administrator or use the
            publisher contact information displayed on the RGHS1 Apply Assistant Chrome Web Store
            listing.
          </p>
        </section>
      </main>
    </div>
  );
}
