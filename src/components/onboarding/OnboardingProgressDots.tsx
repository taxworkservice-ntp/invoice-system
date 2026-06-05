interface OnboardingProgressDotsProps {
  currentStep: number;
  totalSteps: number;
}

export function OnboardingProgressDots({ currentStep, totalSteps }: OnboardingProgressDotsProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full transition-colors ${
            i + 1 <= currentStep ? "bg-[#378ADD]" : "bg-[#E8E6DF]"
          }`}
        />
      ))}
    </div>
  );
}
