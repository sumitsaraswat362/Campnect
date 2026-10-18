import React, { useState } from 'react';
import { judgeTourSteps } from './guidedTour.js';

export const GuidedTourOverlay: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const step = judgeTourSteps[currentStep];

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full p-4 bg-slate-900/95 text-white border border-slate-700 rounded-2xl shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 bg-blue-900/40 px-2 py-0.5 rounded-full">
          {step.badge} • Step {currentStep + 1}/{judgeTourSteps.length}
        </span>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-xs">✕</button>
      </div>
      <h4 className="text-sm font-bold text-white mb-1">{step.title}</h4>
      <p className="text-xs text-slate-300 mb-4 leading-relaxed">{step.content}</p>
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={currentStep === 0}
          onClick={() => setCurrentStep((p) => Math.max(0, p - 1))}
          className="text-xs text-slate-400 hover:text-white disabled:opacity-30 font-medium"
        >
          Previous
        </button>
        {currentStep < judgeTourSteps.length - 1 ? (
          <button
            type="button"
            onClick={() => setCurrentStep((p) => p + 1)}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg"
          >
            Next Step
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg"
          >
            Finish Tour 🎉
          </button>
        )}
      </div>
    </div>
  );
};
