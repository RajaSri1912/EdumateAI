import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.main}>
      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>New: Gemini 1.5 Pro Integrated ✨</div>
          <h1 className={styles.title}>
            Learn Faster, <br />
            <span className={styles.gradientText}>Better, Together.</span>
          </h1>
          <p className={styles.subtitle}>
            EduMate AI transforms your static PDFs and notes into a dynamic,
            interactive learning experience tailored specifically to your brain.
          </p>
          <div className={styles.ctas}>
            <Link href="/dashboard" className={styles.buttonPrimary}>
              Get Started for Free
            </Link>
            <Link href="#features" className={styles.buttonSecondary}>
              Explore Features
            </Link>
          </div>
          <div className={styles.stats}>
            <div className={styles.statItem}>
              <strong>10x</strong>
              <span>Retension Rate</span>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.statItem}>
              <strong>50%</strong>
              <span>Less Study Time</span>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.statItem}>
              <strong>24/7</strong>
              <span>AI Support</span>
            </div>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.floatingCard1}>
            <span className={styles.chipIcon}>📚</span>
            <span>Smart Parsing</span>
          </div>
          <div className={styles.floatingCard2}>
            <span className={styles.chipIcon}>🎧</span>
            <span>Multi-modal</span>
          </div>
          <div className={styles.floatingCard3}>
            <span className={styles.chipIcon}>📊</span>
            <span>Progress</span>
          </div>
          <div className={styles.floatingCard4}>
            <span className={styles.chipIcon}>☁️</span>
            <span>Cloud Sync</span>
          </div>
          <div className={styles.floatingCard5}>
            <span className={styles.chipIcon}>🌐</span>
            <span>Global Learning</span>
          </div>
          <div className={styles.glowOrb}></div>
        </div>
      </section>



      {/* Features Section */}
      <section id="features" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Everything you need to <span className={styles.highlight}>Master</span> anything.</h2>
          <p className={styles.sectionSubtitle}>Powerful features designed to help you focus on what matters: Learning.</p>
        </div>
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardIcon}>🧠</div>
            <h3>Smart Content parsing</h3>
            <p>Upload any study material — PDFs, handwritten notes, or textbook images — and watch EduMate AI structure it into clear, digestible lessons.</p>
          </div>
          <div className={styles.card}>
            <div className={styles.cardIcon}>🔄</div>
            <h3>Adaptive Learning Engine</h3>
            <p>Our AI analyzes your progress and difficulty zones in real-time, automatically adjusting lesson depth to fill your knowledge gaps.</p>
          </div>
          <div className={styles.card}>
            <div className={styles.cardIcon}>🎧</div>
            <h3>Multi-Modal Mastery</h3>
            <p>Switch between reading text, listening to natural AI-generated audio, or watching interactive visual summaries with a single click.</p>
          </div>
          <div className={styles.card}>
            <div className={styles.cardIcon}>♿</div>
            <h3>Universal Accessibility</h3>
            <p>Built with inclusivity at its core. High-contrast modes, dyslexic-friendly typography, and sign language supports integrated by design.</p>
          </div>
          <div className={styles.card}>
            <div className={styles.cardIcon}>📊</div>
            <h3>Deep Insights</h3>
            <p>Track your cognitive load, focus time, and subject mastery with detailed analytics that help you optimize your study schedule.</p>
          </div>
          <div className={styles.card}>
            <div className={styles.cardIcon}>💬</div>
            <h3>Interactive Assessment</h3>
            <p>Test your knowledge with AI-generated quizzes that provide immediate, constructive feedback to help you refine your understanding.</p>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className={styles.howItWorks}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>How EduMate <span className={styles.highlight}>Works</span></h2>
        </div>
        <div className={styles.steps}>
          <div className={styles.stepCard}>
            <span className={styles.stepNumber}>01</span>
            <h3>Upload Documents</h3>
            <p>Drag and drop your study material into your personalized dashboard.</p>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.stepCard}>
            <span className={styles.stepNumber}>02</span>
            <h3>AI Transformation</h3>
            <p>Our engine parses, structures, and creates high-quality learning assets.</p>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.stepCard}>
            <span className={styles.stepNumber}>03</span>
            <h3>Master the Subject</h3>
            <p>Engage with cross-modal content and pass assessments with confidence.</p>
          </div>
        </div>
      </section>

      {/* Global Learning Section */}
      <section className={styles.section}>
        <div className={styles.driveContainer} style={{ flexDirection: 'row-reverse' }}>
          <div className={styles.driveContent}>
            <div className={styles.badge}>Global Reach 🌍</div>
            <h2 className={styles.sectionTitle}>Learn in your <span className={styles.highlight}>Language.</span></h2>
            <p className={styles.sectionSubtitle} style={{ textAlign: 'left', margin: '1.5rem 0' }}>
              Breaking barriers globally. EduMate AI supports 50+ languages, translating your materials, quizzes, and summaries in real-time.
            </p>
            <ul className={styles.driveFeatures}>
              <li>🌐 Instant Document Translation</li>
              <li>🗣️ Multi-lingual Audio Generation</li>
              <li>⚡ Localized AI Context</li>
            </ul>
          </div>
          <div className={styles.driveVisual}>
            <div style={{ fontSize: '5rem', position: 'relative' }}>
              <span style={{ position: 'absolute', top: -40, left: -40, fontSize: '4rem', opacity: 0.5 }}>文</span>
              <span style={{ zIndex: 2, position: 'relative' }}>A</span>
              <span style={{ position: 'absolute', bottom: -40, right: -40, fontSize: '4rem', opacity: 0.5 }}>あ</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Stage Mastery Model Section */}
      <section id="mastery" className={styles.section} style={{ background: 'rgba(99, 102, 241, 0.02)' }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>The 3-Stage <span className={styles.highlight}>Mastery Model</span></h2>
          <p className={styles.sectionSubtitle}>Tailored learning that evolves with your understanding, from first glance to total expertise.</p>
        </div>
        <div className={styles.masteryGrid}>
          <div className={`${styles.masteryCard} ${styles.basicStage}`}>
            <div className={styles.stageBadge}>Stage 01</div>
            <div className={styles.stageIcon}>🌱</div>
            <h3>Basic: The Foundation</h3>
            <p>Perfect for a quick overview. We simplify complex concepts into accurate summaries and clear, essential takeaways.</p>
            <ul className={styles.stageList}>
              <li>⚡ Simple Language</li>
              <li>⚡ Visual Summaries</li>
              <li>⚡ Core Glossary Terms</li>
            </ul>
          </div>
          <div className={`${styles.masteryCard} ${styles.intermediateStage}`}>
            <div className={styles.stageBadge}>Stage 02</div>
            <div className={styles.stageIcon}>🌿</div>
            <h3>Intermediate: The Deep Dive</h3>
            <p>For those ready to advance. Detailed summaries, expanded takeaways, and adaptive quizzes to bridge the gap to expertise.</p>
            <ul className={styles.stageList}>
              <li>⚡ Standard Depth</li>
              <li>⚡ Application Quizzes</li>
              <li>⚡ Concept Mapping</li>
            </ul>
          </div>
          <div className={`${styles.masteryCard} ${styles.advancedStage}`}>
            <div className={styles.stageBadge}>Stage 03</div>
            <div className={styles.stageIcon}>🌳</div>
            <h3>Advanced: Total Mastery</h3>
            <p>The Expert Level. High-energy, technical deep-dives with complex analytical quizzes to ensure you have absolute authority on the subject.</p>
            <ul className={styles.stageList}>
              <li>⚡ Technical Accuracy</li>
              <li>⚡ Complex Analysis</li>
              <li>⚡ Expert Insights</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Drive Sync Section */}
      <section id="cloud" className={styles.section}>
        <div className={styles.driveContainer}>
          <div className={styles.driveContent}>
            <div className={styles.badge}>Cloud Ecosystem ☁️</div>
            <h2 className={styles.sectionTitle}>Your Library, <span className={styles.highlight}>Everywhere.</span></h2>
            <p className={styles.sectionSubtitle} style={{ textAlign: 'left', margin: '1.5rem 0' }}>
              EduMate AI seamlessly syncs with your Google Drive. Upload once, and access your AI-powered insights from any device, anytime.
            </p>
            <ul className={styles.driveFeatures}>
              <li>🔄 Bidirectional Google Drive Sync</li>
              <li>📁 Auto-organized learning folders</li>
              <li>📱 Mobile-ready educational assets</li>
            </ul>
          </div>
          <div className={styles.driveVisual}>
            <div className={styles.driveIconBig}>📁</div>
            <div className={styles.syncLines}>
              <div className={styles.line}></div>
              <div className={styles.line}></div>
              <div className={styles.line}></div>
            </div>
            <div className={styles.aiIconBig}>🤖</div>
          </div>
        </div>
      </section>



      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerBrand}>
            <h2>EduMate AI</h2>
            <p>Empowering minds through adaptive, accessible AI technology.</p>
          </div>
          <div className={styles.footerLinks}>
            <div className={styles.linkColumn}>
              <h4>Product</h4>
              <Link href="#features">Features</Link>
              <Link href="#how-it-works">How it works</Link>
              <Link href="#cloud">Cloud Sync</Link>
              <Link href="#mastery">Mastery Model</Link>
            </div>
            <div className={styles.linkColumn}>
              <h4>Company</h4>
              <Link href="#">About Us</Link>
              <Link href="#">Contact</Link>
              <Link href="#">Privacy Policy</Link>
            </div>
            <div className={styles.linkColumn}>
              <h4>Social</h4>
              <Link href="#">Twitter</Link>
              <Link href="#">LinkedIn</Link>
              <Link href="#">Instagram</Link>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p>&copy; 2026 EduMate AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
