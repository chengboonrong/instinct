import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';

const command = spawnSync('npm', ['audit', '--json'], {encoding: 'utf8', maxBuffer: 10 * 1024 * 1024});
let audit;
try {
  audit = JSON.parse(command.stdout);
} catch {
  console.error('Could not parse npm audit JSON; npm exit status:', command.status);
  console.error((command.stderr ?? '').slice(0, 2500));
  process.exitCode = 1;
}
if (audit) {
  const report = {
    generatedAt: new Date().toISOString(),
    metadata: audit.metadata?.vulnerabilities ?? {},
    packages: Object.entries(audit.vulnerabilities ?? {}).map(([name, issue]) => ({
      name,
      severity: issue.severity,
      direct: Boolean(issue.isDirect),
      installedRange: issue.range,
      via: (issue.via ?? []).map(item => typeof item === 'string' ? item : ({
        title: item.title, url: item.url, severity: item.severity, range: item.range,
      })),
      fixAvailable: issue.fixAvailable,
    })),
  };
  writeFileSync('audit-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log('Dependency audit results:');
  console.log(JSON.stringify(report, null, 2));
  if (audit.error) {
    console.error('npm audit error:', audit.error);
    process.exitCode = 1;
  }
}
