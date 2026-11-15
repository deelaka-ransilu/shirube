// Words that count as "a skill" when Shirube reads an advert. One row per skill:
// the first name is how it is shown, the rest are other ways people write it.
// Matching ignores case. Add a row here to teach Shirube a new skill.
// Words that are also plain English (go, spark, express, swift) are left out on purpose.
export const SKILLS = [
  // Languages
  ['JavaScript', 'JS', 'ECMAScript', 'ES6'], ['TypeScript', 'TS'], ['Python'], ['Java'], ['C#', 'C Sharp'], ['C++'],
  ['PHP'], ['Ruby'], ['Kotlin'], ['Golang'], ['Rust'], ['Dart'], ['Bash', 'Shell scripting', 'Shell script'], ['PowerShell'], ['SQL'], ['HTML', 'HTML5'], ['CSS', 'CSS3'], ['SASS', 'SCSS'],
  // Frontend
  ['React', 'React.js', 'ReactJS'], ['React Native'], ['Next.js', 'NextJS'], ['Vue', 'Vue.js', 'VueJS'], ['Nuxt', 'Nuxt.js'], ['Angular', 'AngularJS'], ['Svelte'], ['Redux'],
  ['Tailwind CSS', 'Tailwind'], ['Bootstrap'], ['jQuery'], ['Vite'], ['Webpack'], ['Figma'], ['Flutter'],
  // Backend
  ['Node.js', 'NodeJS'], ['Express.js', 'ExpressJS'], ['NestJS', 'Nest.js'], ['Spring Boot', 'SpringBoot'], ['Spring'], ['Hibernate'], ['Django'], ['Flask'], ['FastAPI'], ['Laravel'], ['.NET', 'dotnet', 'ASP.NET'], ['Prisma'],
  ['REST', 'REST API', 'REST APIs', 'RESTful', 'RESTful API'], ['GraphQL'], ['gRPC'], ['Microservices', 'Microservice'], ['WebSockets', 'WebSocket'],
  // Data
  ['PostgreSQL', 'Postgres'], ['MySQL'], ['MariaDB'], ['SQL Server', 'MSSQL', 'Microsoft SQL Server'], ['Oracle'], ['SQLite'], ['MongoDB', 'Mongo'], ['Redis'], ['Elasticsearch', 'Elastic Search'], ['Kafka', 'Apache Kafka'], ['RabbitMQ'],
  ['Supabase'], ['Firebase'], ['Power BI', 'PowerBI'], ['Excel', 'Microsoft Excel'], ['Pandas'], ['Apache Spark', 'PySpark'],
  // Cloud, DevOps, SRE
  ['AWS', 'Amazon Web Services'], ['Azure', 'Microsoft Azure'], ['GCP', 'Google Cloud', 'Google Cloud Platform'], ['Docker'], ['Kubernetes', 'K8s'], ['Helm'], ['Terraform'], ['Ansible'], ['Pulumi'],
  ['Linux'], ['Ubuntu'], ['Red Hat', 'RHEL'], ['CentOS'], ['Windows Server'], ['Active Directory'], ['Git'], ['GitHub'], ['GitLab'], ['Bitbucket'],
  ['GitHub Actions'], ['Jenkins'], ['CI/CD', 'CI CD', 'CICD', 'Continuous Integration', 'Continuous Delivery', 'Continuous Deployment'], ['ArgoCD', 'Argo CD'], ['Nginx'], ['Apache HTTP', 'Apache HTTPD'], ['Tomcat'],
  ['Prometheus'], ['Grafana'], ['Datadog'], ['Splunk'], ['ELK', 'ELK Stack'], ['New Relic'], ['Nagios'], ['Zabbix'], ['OpenTelemetry'],
  ['Cloudflare'], ['Vercel'], ['Netlify'], ['VMware', 'vSphere', 'ESXi'], ['Hyper-V'], ['Proxmox'],
  ['Networking'], ['TCP/IP'], ['DNS'], ['DHCP'], ['VPN'], ['Load Balancing', 'Load Balancer', 'Load Balancers'], ['Firewall', 'Firewalls'], ['SSL', 'TLS'],
  ['IAM'], ['Serverless'], ['Lambda', 'AWS Lambda'], ['S3'], ['EC2'], ['RDS'], ['CloudFormation'],
  // Practices and tools
  ['Agile'], ['Scrum'], ['Kanban'], ['Jira'], ['Confluence'], ['ITIL'], ['Postman'], ['Swagger', 'OpenAPI'],
  ['Jest'], ['Cypress'], ['Selenium'], ['JUnit'], ['Playwright'], ['Unit Testing', 'Unit Tests', 'Unit Test'], ['TDD'], ['Automation Testing', 'Test Automation'],
  ['Office 365', 'Microsoft 365', 'M365'], ['SharePoint'], ['Bitrix', 'Bitrix24'], ['Troubleshooting'], ['Incident Management', 'Incident Response'], ['Root Cause Analysis', 'RCA'],
  ['Machine Learning'], ['TensorFlow'], ['PyTorch'],
];

// Lower-cased name or alias -> the name shown. Used to treat "Postgres" and "PostgreSQL" as one skill.
export const ALIAS = (() => {
  const map = new Map();
  for (const [name, ...others] of SKILLS) for (const n of [name, ...others]) map.set(n.toLowerCase(), name);
  return map;
})();
