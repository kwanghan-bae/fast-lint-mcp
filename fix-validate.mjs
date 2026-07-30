import { readFileSync, writeFileSync } from 'fs';

const p = 'src/service/AnalysisService.ts';
let c = readFileSync(p, 'utf-8');

c = c.replace(`  private async validateEnvironment() {
    const res = await checkEnv();
    if (res.pass) return { pass: true };
    return {`,
`  private async validateEnvironment() {
    const res = await checkEnv();
    // ⚡ Bolt: Use optional chaining to safely handle undefined returns from mocks during tests
    if (res?.pass) return { pass: true };
    return {`);

if (c.includes('res?.pass')) {
    writeFileSync(p, c);
    console.log("Replaced successfully");
} else {
    console.log("Not found");
}
