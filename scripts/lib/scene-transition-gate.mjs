export const MIN_ADJACENT_SSIM = 0.95;

export const SCENE_CAPTURE_CONTRACTS = {
  "unified-inbox": {
    allowedFps: [24, 30],
    duration: { maximum: 12, minimum: 7, preferred: 10 },
    posterTime: 0.56,
    resolvedHold: {
      end: 0.78,
      minimumSimilarity: 0.999,
      requiredFields: {
        arrivalProgress: { minimum: 0.999 },
        compositionOpacity: { minimum: 0.999 },
        openingState: { equals: 0 },
        resolvedProgress: { minimum: 0.999 },
        threadProgress: { minimum: 0.999 },
      },
      start: 0.34,
    },
    transitionWindows: [
      {
        distanceField: "connectorDistance",
        end: 0.34,
        id: "incoming-resolve",
        maximumProgressStep: 0.06,
        minimumSimilarity: 0.85,
        progressField: "arrivalProgress",
        start: 0.03,
        terminalDistance: 0.01,
      },
      {
        end: 0.94,
        id: "semantic-reset",
        maximumProgressStep: 0.08,
        maximumOpacityStep: 0.14,
        minimumSimilarity: 0.85,
        opacityField: "compositionOpacity",
        progressField: "resetProgress",
        start: 0.78,
        stateField: "openingState",
        swapMaximumOpacity: 0.03,
      },
    ],
  },
};

function stepTime(frame, frameCount) {
  return (frame + 0.5) / frameCount;
}

function sampleTime(frame, frameCount) {
  return frame / frameCount;
}

function transitionForFrame(frame, frameCount, transitionWindows) {
  const time = stepTime(frame, frameCount);
  return transitionWindows.find(
    ({ end, start }) => time >= start && time <= end,
  );
}

function samplesForWindow(samples, frameCount, window) {
  return samples
    .filter(({ frame }) => {
      const time = sampleTime(frame, frameCount);
      return time >= window.start && time <= window.end;
    })
    .sort((a, b) => a.frame - b.frame);
}

function stepsForWindow(steps, frameCount, window) {
  return steps.filter(({ frame }) => {
    const time = stepTime(frame, frameCount);
    return time >= window.start && time <= window.end;
  });
}

export function captureContractViolations({
  contract,
  fps,
  posterTime = contract?.posterTime,
  seconds,
}) {
  if (!contract) return [];

  const violations = [];
  if (!contract.allowedFps.includes(fps))
    violations.push(
      `frame rate ${fps} is outside the declared ${contract.allowedFps.join("/")} fps contract`,
    );
  if (
    seconds < contract.duration.minimum ||
    seconds > contract.duration.maximum
  )
    violations.push(
      `duration ${seconds}s is outside the declared ${contract.duration.minimum}-${contract.duration.maximum}s contract`,
    );

  const resolvedSeconds =
    (contract.resolvedHold.end - contract.resolvedHold.start) * seconds;
  if (resolvedSeconds < 1.5)
    violations.push(
      `resolved hold ${resolvedSeconds.toFixed(3)}s is shorter than 1.5s`,
    );
  if (
    !Number.isFinite(posterTime) ||
    posterTime < contract.resolvedHold.start ||
    posterTime > contract.resolvedHold.end
  )
    violations.push("poster time must sit inside the declared resolved hold");

  return violations;
}

export function transitionGateViolations({
  contract,
  frameCount,
  samples,
  steps,
  outsideFloor = MIN_ADJACENT_SSIM,
}) {
  const transitionWindows = contract?.transitionWindows ?? [];
  const violations = [];

  if (contract?.resolvedHold) {
    const holdSamples = samplesForWindow(
      samples,
      frameCount,
      contract.resolvedHold,
    );
    const holdSteps = stepsForWindow(steps, frameCount, contract.resolvedHold);

    if (holdSamples.length < 2) {
      violations.push("resolved hold has no usable rendered-state samples");
    } else {
      for (const [field, expectation] of Object.entries(
        contract.resolvedHold.requiredFields ?? {},
      )) {
        const values = holdSamples.map((sample) => Number(sample[field]));
        if (values.some((value) => !Number.isFinite(value))) {
          violations.push(`resolved hold is missing ${field} samples`);
          continue;
        }
        if (
          expectation.minimum !== undefined &&
          values.some((value) => value < expectation.minimum)
        )
          violations.push(
            `resolved hold changes ${field} below ${expectation.minimum}`,
          );
        if (
          expectation.equals !== undefined &&
          values.some((value) => value !== expectation.equals)
        )
          violations.push(
            `resolved hold changes ${field} away from ${expectation.equals}`,
          );
      }
    }

    const unstableHoldStep = holdSteps.find(
      ({ value }) => value < contract.resolvedHold.minimumSimilarity,
    );
    if (unstableHoldStep)
      violations.push(
        `resolved hold changes visually at frames ${unstableHoldStep.frame}-${unstableHoldStep.frame + 1}: ${unstableHoldStep.value.toFixed(4)} is below ${contract.resolvedHold.minimumSimilarity}`,
      );
  }

  for (const step of steps) {
    const window = transitionForFrame(
      step.frame,
      frameCount,
      transitionWindows,
    );
    if (!window && step.value < outsideFloor) {
      violations.push(
        `cut outside transition windows at frames ${step.frame}-${step.frame + 1}: ${step.value.toFixed(4)} is below ${outsideFloor}`,
      );
    }
    if (window && step.value < window.minimumSimilarity) {
      violations.push(
        `${window.id} contains an accidental cut at frames ${step.frame}-${step.frame + 1}: ${step.value.toFixed(4)} is below ${window.minimumSimilarity}`,
      );
    }
  }

  for (const window of transitionWindows) {
    const windowSamples = samplesForWindow(samples, frameCount, window);
    if (windowSamples.length < 2) {
      violations.push(`${window.id} has no usable progression samples`);
      continue;
    }

    const progress = windowSamples.map((sample) =>
      Number(sample[window.progressField]),
    );
    if (progress.some((value) => !Number.isFinite(value))) {
      violations.push(
        `${window.id} is missing ${window.progressField} samples`,
      );
      continue;
    }
    if (progress[0] > 0.06 || progress.at(-1) < 0.94)
      violations.push(
        `${window.id} must cover the declared 0-to-1 progression`,
      );

    for (let index = 1; index < progress.length; index += 1) {
      const delta = progress[index] - progress[index - 1];
      if (delta < -0.001)
        violations.push(
          `${window.id} progression retreats between samples ${index - 1} and ${index}`,
        );
      if (delta > window.maximumProgressStep)
        violations.push(
          `${window.id} jumps ${delta.toFixed(4)} between samples ${index - 1} and ${index}, above ${window.maximumProgressStep}`,
        );
    }

    if (window.distanceField) {
      const distances = windowSamples.map((sample) =>
        Number(sample[window.distanceField]),
      );
      if (distances.some((value) => !Number.isFinite(value))) {
        violations.push(
          `${window.id} is missing ${window.distanceField} samples`,
        );
        continue;
      }
      for (let index = 1; index < distances.length; index += 1) {
        if (distances[index] > distances[index - 1] + 0.01)
          violations.push(
            `${window.id} connector endpoint retreats between samples ${index - 1} and ${index}`,
          );
      }
      if (distances.at(-1) > window.terminalDistance)
        violations.push(
          `${window.id} connector stops ${distances.at(-1).toFixed(4)} from its authored border target`,
        );
    }

    if (window.opacityField) {
      const opacity = windowSamples.map((sample) =>
        Number(sample[window.opacityField]),
      );
      if (opacity.some((value) => !Number.isFinite(value))) {
        violations.push(
          `${window.id} is missing ${window.opacityField} samples`,
        );
      } else {
        const minimumOpacity = Math.min(...opacity);
        const minimumIndex = opacity.indexOf(minimumOpacity);
        if (opacity[0] < 0.94 || opacity.at(-1) < 0.94)
          violations.push(`${window.id} must begin and end visibly resolved`);
        if (minimumOpacity > window.swapMaximumOpacity)
          violations.push(
            `${window.id} never becomes invisible enough for a semantic state swap`,
          );
        for (let index = 1; index < opacity.length; index += 1) {
          const delta = opacity[index] - opacity[index - 1];
          if (Math.abs(delta) > window.maximumOpacityStep)
            violations.push(
              `${window.id} opacity jumps ${Math.abs(delta).toFixed(4)} between samples ${index - 1} and ${index}`,
            );
          if (index <= minimumIndex && delta > 0.001)
            violations.push(
              `${window.id} opacity rises before the invisible swap point`,
            );
          if (index > minimumIndex && delta < -0.001)
            violations.push(
              `${window.id} opacity falls after the invisible swap point`,
            );
        }

        if (window.stateField) {
          const states = windowSamples.map((sample) =>
            Number(sample[window.stateField]),
          );
          const changes = states.flatMap((state, index) =>
            index > 0 && state !== states[index - 1] ? [index] : [],
          );
          if (
            states.some((state) => state !== 0 && state !== 1) ||
            states[0] !== 0 ||
            states.at(-1) !== 1 ||
            changes.length !== 1
          )
            violations.push(
              `${window.id} must swap semantic state exactly once from resolved to opening`,
            );
          else if (opacity[changes[0]] > window.swapMaximumOpacity)
            violations.push(
              `${window.id} swaps semantic state while still visibly opaque`,
            );
        }
      }
    }
  }

  return violations;
}
