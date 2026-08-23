import fs from 'fs';

const content = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

const newContent = content.replace(
`      - name: Run tests
        timeout-minutes: 15
        run: npm test`,
`      - name: Downgrade vitest for Node 18
        if: matrix.node-version == 18
        run: npm install vitest@^2.1.8 @vitest/coverage-v8@^2.1.8 --no-save

      - name: Run tests
        timeout-minutes: 15
        run: npm test`
);

fs.writeFileSync('.github/workflows/ci.yml', newContent);
