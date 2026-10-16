import { useState } from 'react'
import { WelcomeSlide }  from './slides/WelcomeSlide'
import { FeaturesSlide } from './slides/FeaturesSlide'
import { GetStartedSlide } from './slides/GetStartedSlide'

export type OnboardingDone = () => void

interface OnboardingScreenProps {
  onComplete: OnboardingDone
}

const TOTAL = 3

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep]       = useState(0)
  const [exiting, setExiting] = useState(false)

  function advance() {
    if (step < TOTAL - 1) {
      setExiting(true)
      setTimeout(() => {
        setStep(s => s + 1)
        setExiting(false)
      }, 220)
    } else {
      onComplete()
    }
  }

  function skip() {
    onComplete()
  }

  const slideProps = { step, total: TOTAL, onNext: advance, onSkip: skip, exiting }

  return (
    <>
      {step === 0 && <WelcomeSlide  {...slideProps} />}
      {step === 1 && <FeaturesSlide {...slideProps} />}
      {step === 2 && <GetStartedSlide {...slideProps} />}
    </>
  )
}
