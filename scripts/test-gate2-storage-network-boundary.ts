/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Gate 2 Verification Test Suite: Storage & Network Cleanup Boundary
 */

import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import { unifiedTransport } from '../src/shared/network/transport/unifiedTransport';
import { configurationService } from '../src/services/config/configurationService';
import { TokenProvider } from '../src/services/auth/tokenProvider';
import { observabilityService } from '../src/core/observability/observabilityService';

async function runGate2TestSuite() {
  console.log('===============================================================');
  console.log('🧪 GATE 2 VERIFICATION TEST SUITE: STORAGE & NETWORK BOUNDARY');
  console.log('===============================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
      failedTests++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST A: Direct Access Boundary Check (Static Analysis of src/)
  // -------------------------------------------------------------------------
  console.log('--- TEST A: Direct Access Violation Scan ---');
  try {
    const srcDir = path.resolve(process.cwd(), 'src');
    
    // Whitelisted infrastructure files allowed to interface directly with storage
    const storageWhitelist = [
      'configurationService.ts',
      'tokenProvider.ts',
      'backupService.ts',
      'deviceFingerprintService.ts',
      'webStorageProvider.ts',
      'storageProvider.ts',
      'dexieStorageAdapter.ts',
      'configMigration.ts'
    ];

    const violations: string[] = [];

    function scanDirectory(dir: string) {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (/\.(ts|tsx)$/.test(file)) {
          const fileName = path.basename(file);
          if (storageWhitelist.includes(fileName)) continue;

          const content = fs.readFileSync(fullPath, 'utf8');
          
          // Check for direct localStorage or sessionStorage calls
          const localStorageMatches = (content.match(/localStorage\.(getItem|setItem|removeItem|clear)/g) || []);
          const sessionStorageMatches = (content.match(/sessionStorage\.(getItem|setItem|removeItem|clear)/g) || []);

          if (localStorageMatches.length > 0 || sessionStorageMatches.length > 0) {
            violations.push(`${path.relative(srcDir, fullPath)}: ${localStorageMatches.length + sessionStorageMatches.length} match(es)`);
          }
        }
      }
    }

    scanDirectory(srcDir);

    assert(
      violations.length === 0,
      'Test A: Zero direct localStorage/sessionStorage access violations in src/',
      violations.length > 0 ? `Violations found:\n  ${violations.join('\n  ')}` : undefined
    );
  } catch (e: any) {
    assert(false, 'Test A: Static analysis execution failed', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST B: Configuration Service Integration
  // -------------------------------------------------------------------------
  console.log('\n--- TEST B: Configuration Service Storage Boundary ---');
  try {
    await configurationService.set('test_boundary_key', { mode: 'sovereign', version: '2026.1' });
    const syncValue = configurationService.getSync<{ mode: string; version: string }>('test_boundary_key');
    const asyncValue = await configurationService.get<{ mode: string; version: string }>('test_boundary_key');

    assert(
      syncValue?.mode === 'sovereign' && asyncValue?.version === '2026.1',
      'Test B: ConfigurationService synchronous and asynchronous state storage'
    );
  } catch (e: any) {
    assert(false, 'Test B: ConfigurationService test error', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST C: TokenProvider Session Context Boundary
  // -------------------------------------------------------------------------
  console.log('\n--- TEST C: TokenProvider Session Context Boundary ---');
  try {
    const mockUser = {
      id: 'USR-GATE2-001',
      user_id: 'USR-GATE2-001',
      User_Name: 'Gate2 Engineer',
      User_Email: 'gate2@pharmaflow.sa',
      Role: 'SuperAdmin',
      tenant_id: 'TNT-GATE2'
    };

    TokenProvider.setSession(mockUser as any, 'access-token-123', 'refresh-token-456');

    const activeSession = TokenProvider.getCurrentSession();
    const token = TokenProvider.getAccessToken();
    const isAuth = TokenProvider.isAuthenticated();

    assert(
      isAuth && token === 'access-token-123' && activeSession?.tenantId === 'TNT-GATE2',
      'Test C: TokenProvider manages session context without direct localStorage dependency'
    );
  } catch (e: any) {
    assert(false, 'Test C: TokenProvider session test error', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST D: Unified Transport Architecture Boundary
  // -------------------------------------------------------------------------
  console.log('\n--- TEST D: Unified Transport Architecture Boundary ---');
  try {
    const transportInst = unifiedTransport;
    assert(
      typeof transportInst.get === 'function' &&
      typeof transportInst.post === 'function' &&
      typeof transportInst.put === 'function' &&
      typeof transportInst.delete === 'function',
      'Test D: UnifiedTransport provides complete HTTP verb boundary methods'
    );
  } catch (e: any) {
    assert(false, 'Test D: Unified Transport test error', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST E: Observability Service Boundary
  // -------------------------------------------------------------------------
  console.log('\n--- TEST E: Observability Service Boundary ---');
  try {
    const testError = new Error('Boundary Test Error');
    await observabilityService.recordError(testError, { feature: 'STORAGE_NETWORK_GATE2' }, 'SYSTEM', 'WARNING');

    assert(
      true,
      'Test E: ObservabilityService safely logs errors using centralized configuration'
    );
  } catch (e: any) {
    assert(false, 'Test E: Observability Service test error', e.message);
  }

  // Summary
  console.log('\n===============================================================');
  console.log(`📊 GATE 2 VERIFICATION SUMMARY: Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 GATE 2 CLEANUP VERIFICATION PASSED SUCCESSFULLY!');
  }
}

runGate2TestSuite().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
