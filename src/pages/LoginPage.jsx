import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useNotification } from '@contexts/NotificationContext';
import { 
  Page, 
  Container, 
  Card, 
  Input, 
  Button, 
  Typography, 
  Icon 
} from '@components/Components';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  // Continuing takes this long only when the server is still starting.
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    if (!isLoading) return undefined;
    const timer = setTimeout(() => setWaking(true), 4000);
    return () => { clearTimeout(timer); setWaking(false); };
  }, [isLoading]);
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const { login, resume, continueSession, signOutAway } = useAuth();
  const { error: showError, success: showSuccess } = useNotification();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Simple validation - just check if fields are filled
    if (!formData.identifier || !formData.password) {
      if (!formData.identifier) {
        showError('Email or username is required');
      } else if (!formData.password) {
        showError('Password is required');
      }
      return;
    }
    
    setIsLoading(true);

    try {
      const result = await login(twoFactorStep ? { ...formData, twoFactorToken: twoFactorToken.trim() } : formData);

      if (result.requiresTwoFactor) {
        setTwoFactorStep(true);
        return;
      }

      if (result.success) {
        showSuccess('Login successful! Welcome back.');
        navigate('/'); // Navigate to dashboard after successful login
      } else {
        showError(result.error || 'Login failed. Please check your credentials.');
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = twoFactorStep
    ? twoFactorToken.trim().length >= 6
    : formData.identifier && formData.password;

  if (resume) {
    const carryOn = async () => {
      setIsLoading(true);
      try {
        navigate(await continueSession());
      } catch {
      } finally {
        setIsLoading(false);
      }
    };
    return (
      <Page layout="flex" align="center" justify="center" background="rings" backgroundFade="radial">
        <Card layout="flex-column" padding="xl" align="center" gap="lg" width="100%" maxWidth="560px">
          <Container layout="flex-column" gap="sm" align="center" padding="none">
            <Icon name="FaUserCheck" size="lg" color="primary" />
            <Typography as="h1" size="2xl" weight="bold" font="secondary" color="primary" align="center">
              Welcome back
            </Typography>
            <Typography align="center">
              {waking ? 'The server is starting. This can take a minute or two.' : 'You were away for a while. Continue where you left off.'}
            </Typography>
          </Container>
          <Container layout="flex-column" gap="md" padding="none" width="92%">
            <Input type="text" name="identifier" label="Username" variant="floating" value={resume.username} readOnly width="100%" autoComplete="username" />
            <Button color="primary" width="100%" disabled={isLoading} onClick={carryOn}>
              <Icon name={isLoading ? 'FaSpinner' : 'FaSignInAlt'} />
              {isLoading ? 'Continuing...' : `Continue as ${resume.username}`}
            </Button>
          </Container>
          <Button color="secondary" size="sm" disabled={isLoading} onClick={signOutAway}>
            Not you? Sign out
          </Button>
        </Card>
      </Page>
    );
  }

  return (
    <Page layout="flex" align="center" justify="center" background="rings" backgroundFade="radial">
        <Card layout="flex-column" padding="xl" align="center" gap="lg" width="100%" maxWidth="560px">
            {/* Header */}
            <Container layout="flex-column" gap="sm" align="center" padding="none">
              <Icon name={twoFactorStep ? 'FaShieldAlt' : 'FaLock'} size="lg" color="primary" />
              <Typography as="h1" size="2xl" weight="bold" font="secondary" color="primary" style={{ textAlign: 'center' }}>
                {twoFactorStep ? 'Two-Factor Authentication' : 'Sign In'}
              </Typography>
              <Typography align="center">
                Welcome back! Please sign in to your account.
              </Typography>
            </Container>

            {/* Login Form */}
              <Container
                as="form"
                layout="flex-column"
                align="stretch"
                width="92%"
                gap="md"
                padding="none"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleSubmit(e);
                  }
                }}
                onSubmit={handleSubmit}
              >
                {twoFactorStep && (
                  <>
                    <Typography size="sm" align="center" style={{ display: 'block', textAlign: 'center', width: '100%' }}>
                      Enter the 6-digit code from your authenticator app, or a backup code.
                    </Typography>
                    <Input
                      type="text"
                      name="twoFactorToken"
                      label="Authentication code"
                      variant="floating"
                      value={twoFactorToken}
                      onChange={e => setTwoFactorToken(e.target.value)}
                      required
                      width="100%"
                      maxLength={20}
                      autoComplete="one-time-code"
                    />
                    <Button
                      type="button"
                      color="secondary"
                      width="100%"
                      onClick={() => { setTwoFactorStep(false); setTwoFactorToken(''); }}
                      disabled={isLoading}
                    >
                      Back to sign in
                    </Button>
                  </>
                )}

                {!twoFactorStep && (
                <Input
                  type="text"
                  name="identifier"
                  label="Email or Username"
                  variant="floating"
                  value={formData.identifier}
                  onChange={handleInputChange}
                  required
                  width="100%"
                  autoComplete="username"
                />
                )}

                {!twoFactorStep && (
                <Input
                  type="password"
                  name="password"
                  label="Password"
                  variant="floating"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  width="100%"
                  autoComplete="current-password"
                />
                )}

                <Button
                  type="submit"
                  color="primary"
                  disabled={!isFormValid || isLoading}
                  onClick={handleSubmit}
                  width="100%"
                >
                  {isLoading ? (
                    <>
                      <Icon name="FaSpinner" />
                      Signing In...
                    </>
                  ) : (
                    <>
                      <Icon name="FaSignInAlt" />
                      Sign In
                    </>
                  )}
                </Button>
              </Container>

            {/* Actions */}
            <Container layout="flex-column" gap="sm" align="center" padding="none">
              <Button
                color="secondary"
                size="sm"
                onClick={() => navigate('/forgot-password')}
              >
                Forgot your password?
              </Button>

              <Container layout="flex" justify="center" gap="sm">
                <Typography size="sm">
                  Don't have an account?
                </Typography>
                <Button
                  color="tertiary"
                  size="sm"
                  onClick={() => navigate('/signup')}
                >
                  Sign Up
                </Button>
              </Container>
            </Container>
        </Card>
    </Page>
  );
};

export default LoginPage;
