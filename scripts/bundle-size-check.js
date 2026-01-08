// Bundle size regression detection
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASELINE = {
  main: 400 * 1024,        // 400KB
  'd3-vendor': 300 * 1024, // 300KB
  'ui-vendor': 150 * 1024, // 150KB
  'react-vendor': 150 * 1024, // 150KB
};

function checkBundleSize() {
  const distDir = path.join(__dirname, '../client/dist/assets/js');
  
  if (!fs.existsSync(distDir)) {
    console.error('❌ Build directory not found. Run npm run build first.');
    process.exit(1);
  }
  
  const files = fs.readdirSync(distDir);
  
  let regressions = [];
  
  Object.entries(BASELINE).forEach(([chunk, maxSize]) => {
    // Use regex for more precise matching to avoid prefix collisions
    const pattern = new RegExp(`^${chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[a-f0-9]+\\.js$`);
    const file = files.find(f => pattern.test(f));
    if (file) {
      const size = fs.statSync(path.join(distDir, file)).size;
      if (size > maxSize) {
        regressions.push({
          chunk,
          size,
          maxSize,
          increase: size - maxSize,
        });
      }
      console.log(`✓ ${chunk}: ${(size / 1024).toFixed(2)}KB / ${(maxSize / 1024).toFixed(2)}KB`);
    } else {
      console.log(`⚠ ${chunk}: Not found (may be split differently)`);
    }
  });
  
  if (regressions.length > 0) {
    console.error('\n❌ Bundle size regression detected:');
    regressions.forEach(r => {
      console.error(`  ${r.chunk}: ${(r.size / 1024).toFixed(2)}KB (limit: ${(r.maxSize / 1024).toFixed(2)}KB, +${(r.increase / 1024).toFixed(2)}KB)`);
    });
    process.exit(1);
  }
  
  console.log('\n✅ All bundle sizes within limits');
}

checkBundleSize();
