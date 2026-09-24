import { type LandingHomeCopy } from './landingHomePage.shared'
import { LandingAuthActions, LandingHomeButton, LandingTopBarActions } from './LandingTopBarActions'
import styles from './LandingHomePage.module.css'

export type LandingTopBarProps = {
  locale: string
  copy: LandingHomeCopy
}

export function LandingTopBar({
  locale,
  copy,
}: LandingTopBarProps) {
  return (
    <header className={styles.topBar}>
      <div className={styles.topBarSpacer}>
        <LandingHomeButton locale={locale} />
      </div>
      <LandingTopBarActions
        locale={locale}
        copy={copy}
      />
      <div className={styles.topBarAuth}>
        <LandingAuthActions locale={locale} />
      </div>
    </header>
  )
}
