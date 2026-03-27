export interface ModelReconciliationResult {
  model: string;
  wasAutoSelected: boolean;
  message?: string;
}

export const chooseModelForSave = (candidate: string, availableModels: string[]): string => {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return "";
  }

  if (availableModels.length === 0) {
    return trimmed;
  }

  return availableModels.includes(trimmed) ? trimmed : "";
};

export const reconcileSavedModel = (savedModel: string, availableModels: string[]): ModelReconciliationResult => {
  const trimmed = savedModel.trim();

  if (availableModels.length === 0) {
    return { model: trimmed, wasAutoSelected: false };
  }

  if (trimmed && availableModels.includes(trimmed)) {
    return { model: trimmed, wasAutoSelected: false };
  }

  const fallbackModel = availableModels[0];
  if (trimmed) {
    return {
      model: fallbackModel,
      wasAutoSelected: true,
      message: `Saved model not found, switched to ${fallbackModel}.`,
    };
  }

  return {
    model: fallbackModel,
    wasAutoSelected: true,
    message: `No model selected, switched to ${fallbackModel}.`,
  };
};

export const resolveGenerationModel = (requestedModel: string | undefined, savedModel: string): string => {
  const requested = (requestedModel ?? "").trim();
  if (requested) {
    return requested;
  }

  return savedModel.trim();
};
