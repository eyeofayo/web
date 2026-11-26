import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import authService from '../client/auth.client';
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

export const ForgotPasswordPage = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const { forgotPassword } = useAuth();
    const { error: showError, success: showSuccess } = useNotification();

    const handleEmailChange = (e) => {
        setEmail(e.target.value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Simple validation - just check if email is provided
        if (!email) {
            showError('Please enter your email address');
            return;
        }
        
        setIsLoading(true);

        try {
            const result = await forgotPassword(email);
            
            if (result.success) {
                setIsSubmitted(true);
            } else {
                showError(result.error || 'Failed to send reset instructions. Please try again.');
            }
        } catch {
        } finally {
            setIsLoading(false);
        }
    };

    if (isSubmitted) {
        return (
            <Page>
                <Container layout="flex" align="center" justify="center" style={{ minHeight: '100vh' }}>
                    <Card style={{ maxWidth: '400px', width: '100%' }}>
                        <Container layout="flex-column" gap="lg" justify="center">
                            <Icon name="FaCheckCircle" size="lg" color="success"/>
                            <Typography as="h1" size="2xl" weight="bold" font="secondary" color="primary">
                                Check Your Email
                            </Typography>
                            <Typography align="center">
                                We've sent password reset instructions to <strong>{email}</strong>
                            </Typography>
                            <Typography align="center" size="sm">
                                Please check your email and click the reset link to continue.
                            </Typography>
                            <Button
                                color="primary"
                                onClick={() => navigate('/login')}
                                width="100%"
                            >
                                <Icon name="FaArrowLeft"/>
                                Back to Sign In
                            </Button>
                        </Container>
                    </Card>
                </Container>
            </Page>
        );
    }

    return (
        <Page>
            <Container layout="flex" align="center" justify="center" style={{ minHeight: '100vh' }}>
                <Card style={{ maxWidth: '400px', width: '100%' }}>
                    <Container layout="flex-column" gap="lg" align="center">
                        {/* Header */}
                        <Container layout="flex-column" gap="sm" align="center" justify="center" padding="none">
                            <Icon name="FaKey" size="lg" color="primary"/>
                            <Typography as="h1" size="2xl" weight="bold" font="secondary" color="primary">
                                Forgot Password?
                            </Typography>
                            <Typography>
                                No worries! Enter your email address and we'll send you reset instructions.
                            </Typography>
                        </Container>

                        {/* Form */}
                        <Container layout="flex-column" gap="md" width="100%">
                            <Input
                                type="email"
                                name="email"
                                label="Email Address"
                                variant="floating"
                                value={email}
                                onChange={handleEmailChange}
                                required
                                width="100%"
                                icon="FaEnvelope"
                            />

                            <Button
                                type="submit"
                                color="primary"
                                size="lg"
                                disabled={!email || isLoading}
                                onClick={handleSubmit}
                                width="100%"
                            >
                                {isLoading ? (
                                    <>
                                        <Icon name="FaSpinner"/>
                                        Sending Instructions...
                                    </>
                                ) : (
                                    <>
                                        <Icon name="FaPaperPlane"/>
                                        Send Reset Instructions
                                    </>
                                )}
                            </Button>
                        </Container>
                        {/* Back to Login */}
                        <Button
                            color="secondary"
                            size="sm"
                            onClick={() => navigate('/login')}
                        >
                            <Icon name="FaArrowLeft"/>
                            Back to Sign In
                        </Button>
                    </Container>
                </Card>
            </Container>
        </Page>
    );
};

// The frame of the two pages opened from links in emails.
const LinkCard = ({ icon, title, lead, children }) => (
    <Page>
        <Container layout="flex" align="center" justify="center" minHeight="100vh">
            <Card maxWidth="400px" width="100%">
                <Container layout="flex-column" gap="lg" align="center">
                    <Icon name={icon} size="lg" color="primary" />
                    <Typography as="h1" size="2xl" weight="bold" font="secondary" color="primary" align="center">{title}</Typography>
                    {lead && <Typography align="center" size="sm">{lead}</Typography>}
                    {children}
                </Container>
            </Card>
        </Container>
    </Page>
);

// Opened from the link in a password reset email.
export const ResetPasswordPage = () => {
    const navigate = useNavigate();
    const { token } = useParams();
    const { resetPassword } = useAuth();
    const [password, setPassword] = useState('');
    const [again, setAgain] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const differs = again.length > 0 && again !== password;

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!password || differs) return;
        setIsLoading(true);
        try {
            await resetPassword(token, password);
            navigate('/', { replace: true });
        } catch {
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <LinkCard icon="FaKey" title="Choose a new password" lead="Use 8 to 30 characters with an uppercase letter, a lowercase letter, a number and a symbol.">
            <Container as="form" layout="flex-column" gap="md" padding="none" width="100%" onSubmit={handleSubmit}>
                <Input type="password" name="password" label="New password" value={password} onChange={(event) => setPassword(event.target.value)} required width="100%" autoComplete="new-password" />
                <Input type="password" name="confirmPassword" label="New password again" value={again} onChange={(event) => setAgain(event.target.value)} required width="100%" autoComplete="new-password" validationState={differs ? 'error' : 'default'} />
                {differs && <Typography size="xs" color="error">The two passwords differ.</Typography>}
                <Button type="submit" color="primary" width="100%" disabled={!password || !again || differs || isLoading}>
                    {isLoading ? 'Saving…' : 'Save new password'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/forgot-password')}>Send a new link</Button>
            </Container>
        </LinkCard>
    );
};

// Opened from the link in a verification email, signed in or not. A link works once, so it is sent once.
export const VerifyEmailPage = () => {
    const { token } = useParams();
    const { user } = useAuth();
    const [state, setState] = useState({ status: 'checking', message: '' });
    const sent = useRef(null);

    useEffect(() => {
        if (sent.current === token) return;
        sent.current = token;
        authService.verifyEmail(token)
            .then((reply) => setState({ status: 'done', message: reply.message }))
            .catch((error) => setState({ status: 'failed', message: error.response?.data?.message || 'This link could not be checked. Try again.' }));
    }, [token]);

    // A full load, so the account is read again with the email marked as confirmed.
    const go = (path) => window.location.assign(path);
    const titles = { checking: 'Confirming your email…', done: 'Email confirmed', failed: 'This link did not work' };
    const leads = {
        checking: 'One moment.',
        done: 'Your email address is confirmed.',
        failed: `${state.message.replace(/[.!]?$/, '.')} Links last 24 hours and work once; you can send a new one from your account settings.`
    };
    return (
        <LinkCard icon={state.status === 'failed' ? 'FaTimesCircle' : 'FaCheckCircle'} title={titles[state.status]} lead={leads[state.status]}>
            {state.status !== 'checking' && (
                user
                    ? <Button color="primary" width="100%" onClick={() => go('/')}>Continue</Button>
                    : <Button color="primary" width="100%" onClick={() => go('/login')}>Sign in</Button>
            )}
        </LinkCard>
    );
};

export default ForgotPasswordPage;
