# ICEWORK Technology website and workspace

The public website includes a working enquiry form. The workspace at `/dashboard` provides customer and administrator views using Netlify Identity, Netlify Functions, and Netlify Database. There is no sample customer data or default administrator password.

## Access

Customers create an account and confirm their email before signing in. They can send and track enquiries, view projects assigned to them, request or cancel appointments, and update their contact details. Public enquiries become visible in a customer's workspace after they confirm and sign in with the same email address.

Administrators use the same sign-in page. The site owner must assign the `admin` role to a confirmed account through the site's Netlify Identity user management. The server accepts administrator roles in server-managed `app_metadata.roles` or `app_metadata.authorization.roles`, matching the site's role configuration. Customer-editable metadata never grants administrator access, and the first signup is not automatically promoted.

Administrators can create and edit clients, create projects, update project progress and completion dates, update enquiry statuses, and manage appointment statuses. A client record is linked to the corresponding customer account only after the customer confirms ownership of the matching email address. Administrator accounts are not automatically created as clients.

## Appointments

All appointment inputs and displays use West Africa Time (WAT, UTC+1), regardless of the visitor's browser timezone. Booking submissions request an appointment; they do not guarantee availability. An administrator confirms an appointment after checking the team's schedule. Customers can cancel requested or confirmed appointments, but cannot change their status to confirmed or completed.

## Deployment

Netlify publishes only `public/`; source files, database configuration, and server dependencies are not published as static assets. The dependency installation step copies the installed Identity SDK and its internal transport dependency into `public/vendor/`, so browser authentication does not depend on an external JavaScript CDN. Keep dependency installation enabled, including the `postinstall` script.

The Netlify Identity activation marker was created using the platform's activation script. Email confirmation, recovery, and invitation links are handled on the dashboard, including links that initially land on the homepage. Identity email delivery and the first administrator's role should be verified after deployment.

The Drizzle schema is defined in `db/schema.ts`, with a generated initial migration in `netlify/database/migrations/`. Netlify provisions the database and applies migrations during deployment. Use the beta releases of `drizzle-orm` and `drizzle-kit` required by the Netlify Database adapter. No database credentials are placed in the browser.

## Development and checks

Install dependencies with `npm install`. Run `npm run typecheck` for server-side TypeScript validation and `node --check public/dashboard.js` for browser script syntax validation.

Run `/opt/buildhome/node-deps/node_modules/.bin/netlify dev --port 8889` in the provided environment to emulate the site and functions. A deployed database branch and activated Identity service are required to fully verify authentication and persistence. No build command is needed for the static frontend.
