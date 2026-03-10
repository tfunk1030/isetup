import { normalizeSetup, getNormalizedParameter } from '../src/lib/setup-normalization';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runExactMappingCase(): void {
  const setup = {
    Chassis: {
      Front: {
        HeaveSpring: 90,
      },
    },
  };

  const normalized = normalizeSetup(setup);
  const frontHeave = getNormalizedParameter(normalized, 'platform.frontHeaveSpring');

  assert(frontHeave != null, 'Exact case: front heave spring should be mapped');
  assert(frontHeave.mappingQuality === 'exact', 'Exact case: mapping quality should be exact');
  assert(frontHeave.confidence === 'HIGH', 'Exact case: confidence should be HIGH');
}

function runOrderedFallbackCase(): void {
  const setup = {
    Chassis: {
      Front: {
        Subsection: {
          HeaveSpring: 88,
        },
      },
    },
  };

  const normalized = normalizeSetup(setup);
  const frontHeave = getNormalizedParameter(normalized, 'platform.frontHeaveSpring');

  assert(frontHeave != null, 'Ordered case: front heave spring should be mapped');
  assert(frontHeave.mappingQuality === 'ordered', 'Ordered case: mapping quality should be ordered');
  assert(frontHeave.confidence === 'MEDIUM', 'Ordered case: confidence should be MEDIUM');
}

function runAmbiguousMappingCase(): void {
  const setup = {
    Foo: {
      Chassis: {
        Front: {
          ArbBlades: 3,
        },
      },
    },
    Bar: {
      Chassis: {
        Front: {
          ArbBlades: 4,
        },
      },
    },
  };

  const normalized = normalizeSetup(setup);
  const frontArbBlades = getNormalizedParameter(normalized, 'suspension.frontArbBlades');

  assert(frontArbBlades != null, 'Ambiguous case: front ARB blades should still map deterministically');
  assert(frontArbBlades.mappingQuality === 'ambiguous', 'Ambiguous case: mapping quality should be ambiguous');
  assert(frontArbBlades.confidence === 'LOW', 'Ambiguous case: confidence should degrade to LOW');
  assert(
    (frontArbBlades.candidateSourcePaths?.length || 0) === 2,
    'Ambiguous case: candidate source paths should include all best candidates'
  );
  assert(
    normalized.ambiguousKeys.includes('suspension.frontArbBlades'),
    'Ambiguous case: key should be listed in ambiguousKeys'
  );
  assert(
    normalized.mappingWarnings.some((warning) => warning.includes('suspension.frontArbBlades')),
    'Ambiguous case: mapping warning should be emitted'
  );
}

function run(): void {
  runExactMappingCase();
  runOrderedFallbackCase();
  runAmbiguousMappingCase();
  console.log('setup-normalization-regression: all checks passed');
}

run();
