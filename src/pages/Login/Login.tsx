import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Icon } from '../../components/Icon/Icon';
import logo from '../../assets/logo.svg';
import styles from './Login.module.css';

/**
 * Directus email/password login. On success → redirect to the page the user
 * came from (or `/`). On failure the error surfaces inline.
 */
export function Login() {
  const { login, loginError, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const ok = await login(email.trim(), password);
    setSubmitting(false);
    if (ok) {
      navigate('/', { replace: true });
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={logo} alt="" className={styles.logo} aria-hidden="true" />
          <span className={styles.brandName}>
            Inti Pangan
            <br />
            Perkasa
          </span>
        </div>

        <h1 className={styles.title}>Sign in to IPP-OrderFlow</h1>
        <p className={styles.subtitle}>Enter your Directus account credentials.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting || loading}
              placeholder="you@example.com"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting || loading}
            />
          </label>

          {loginError && (
            <p className={styles.error} role="alert">
              <Icon name="search" size={16} />
              {loginError}
            </p>
          )}

          <button
            type="submit"
            className={styles.submit}
            disabled={submitting || loading || !email || !password}
          >
            {submitting || loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
