import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Page, Container, Card, Typography, Button, ButtonGroup, Badge, Icon, Input, Data, CircularProgress } from '@components/Components';
import { useNotification } from '@contexts/NotificationContext';
import { useAuth } from '@contexts/AuthContext';
import { useTheme } from '@contexts/ThemeContext';
import { billingService, formatMoney } from '../client/billing.client';
import FONT_REGISTRY from '@styles/font.registry';

const AMOUNTS = [1000, 2500, 5000, 10000];
const KINDS = { topup: 'Payment', charge: 'Charge', hold: 'Set aside', refund: 'Refund', adjustment: 'Adjustment', dispute: 'Disputed' };
const KIND_COLORS = { topup: 'success', charge: 'default', hold: 'warning', refund: 'secondary', adjustment: 'tertiary', dispute: 'error' };

const failText = (error, fallback) => error?.response?.data?.message || fallback;
const closeGenie = () => document.querySelector('[data-genie-backdrop]')?.click();
const toCents = (text) => Math.round(Number(text) * 100);

const rowsOf = (lines) => lines.map((line) => ({
    id: line.id,
    when: line.at,
    kind: line.kind,
    what: line.about || (line.kind === 'hold' ? `${formatMoney(line.held)} set aside` : ''),
    amount: line.change,
    balance: line.balance,
    line
}));

const LEDGER_FIELDS = {
    when: { component: Typography, props: { size: 'xxs', color: 'muted' }, transform: (value) => ({ children: new Date(value).toLocaleString() }) },
    kind: { component: Badge, props: { size: 'xs' }, transform: (value) => ({ color: KIND_COLORS[value], children: KINDS[value] || value }) },
    what: { component: Typography, props: { size: 'xs' } },
    amount: { component: Typography, props: { size: 'xs', weight: 'medium' }, transform: (value) => ({ color: value > 0 ? 'success' : 'default', children: `${value > 0 ? '+' : ''}${formatMoney(value)}` }) },
    balance: { component: Typography, props: { size: 'xs' }, transform: (value) => ({ children: formatMoney(value) }) }
};

const Ledger = ({ lines, more, onMore, genie }) => (lines.length === 0 ? (
    <Typography as="p" size="xs" color="muted">Nothing yet. Every payment and charge will be listed here.</Typography>
) : (
    <Container layout="flex-column" gap="sm" padding="none" width="100%">
        <Data data={rowsOf(lines)} size="xs" fieldConfig={LEDGER_FIELDS} exclude={['id', 'line']} sortable={false} flat width="100%" genie={genie} />
        {more && <Button size="xs" variant="ghost" justifySelf="start" onClick={onMore}>Show earlier lines</Button>}
    </Container>
));

const Totals = ({ balance, held }) => (
    <Container layout="flex" gap="xl" align="end" padding="none">
        <Container layout="flex-column" gap="none" padding="none">
            <Typography as="p" size="xxs" color="muted">Credit</Typography>
            <Typography as="p" size="2xl" weight="semibold" font="secondary">{formatMoney(balance)}</Typography>
        </Container>
        {held > 0 && (
            <Container layout="flex-column" gap="none" padding="none">
                <Typography as="p" size="xxs" color="muted">Set aside for something running</Typography>
                <Typography as="p" size="md" weight="medium">{formatMoney(held)}</Typography>
            </Container>
        )}
    </Container>
);

// Stripe's own script, loaded from Stripe's address as Stripe requires (never bundled), once, when a payment starts.
let stripeScript = null;
const loadStripe = () => stripeScript ||= new Promise((resolve, reject) => {
    if (window.Stripe) {
        resolve(window.Stripe);
        return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://js.stripe.com/endive/stripe.js';
    tag.onload = () => (window.Stripe ? resolve(window.Stripe) : reject(new Error('Stripe did not load.')));
    tag.onerror = () => {
        stripeScript = null;
        tag.remove();
        reject(new Error('Stripe could not be reached. Check your connection and try again.'));
    };
    document.head.appendChild(tag);
});

// Paying inside this page: Stripe's card field sits in it, in the theme's colours, and this page's button pays.
// The card number goes from Stripe's field straight to Stripe.
const PayHere = ({ cents, onPaid, onBack }) => {
    const { readColors, mode } = useTheme();
    const field = useRef(null);
    const actions = useRef(null);
    const started = useRef(null);
    const [state, setState] = useState({ status: 'loading', message: '' });

    useEffect(() => {
        let element = null;
        let gone = false;
        (async () => {
            try {
                // One payment page per visit to this form, even when React runs this effect twice while developing.
                started.current ||= billingService.startCheckout(cents, true);
                const answer = await started.current;
                if (answer.url) {
                    window.location.assign(answer.url);
                    return;
                }
                const Stripe = await loadStripe();
                if (gone) return;
                const colors = readColors();
                const style = getComputedStyle(document.body);
                // Stripe's field cannot use this page's fonts, but it loads a Google Fonts stylesheet itself.
                const family = style.getPropertyValue('--font-family').trim();
                const first = family.split(',')[0].replace(/['"]/g, '').trim();
                const font = Object.values(FONT_REGISTRY).find((entry) => entry.google && entry.family.split(',')[0].replace(/['"]/g, '').trim() === first);
                const checkout = Stripe(answer.publishableKey).initCheckoutElementsSdk({
                    clientSecret: answer.clientSecret,
                    elementsOptions: {
                        ...(font ? { fonts: [{ cssSrc: `https://fonts.googleapis.com/css2?family=${font.google}&display=swap` }] } : {}),
                        appearance: {
                            theme: mode === 'dark' ? 'night' : 'stripe',
                            variables: {
                                colorPrimary: colors.button || colors.primary,
                                colorBackground: colors.card,
                                colorText: colors.text,
                                fontFamily: family || undefined,
                                borderRadius: style.getPropertyValue('--input-radius').trim() || undefined
                            }
                        }
                    }
                });
                element = checkout.createPaymentElement();
                element.mount(field.current);
                const loaded = await checkout.loadActions();
                if (gone) return;
                if (loaded.type !== 'success') throw new Error(loaded.error?.message || 'Stripe could not start the payment.');
                actions.current = loaded.actions;
                setState({ status: 'ready', message: '' });
            } catch (error) {
                if (!gone) setState({ status: 'failed', message: failText(error, error?.message || 'The payment could not be started.') });
            }
        })();
        return () => {
            gone = true;
            element?.destroy?.();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const pay = async () => {
        setState({ status: 'paying', message: '' });
        try {
            const result = await actions.current.confirm({ redirect: 'if_required' });
            if (result.type === 'error') {
                setState({ status: 'ready', message: result.error?.message || 'The payment did not go through.' });
                return;
            }
            onPaid();
        } catch (error) {
            setState({ status: 'ready', message: error?.message || 'The payment did not go through.' });
        }
    };

    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%">
            <Typography as="h3" size="sm" weight="semibold">{`Pay ${formatMoney(cents)}`}</Typography>
            <Container ref={field} padding="none" width="100%" minHeight="120px" />
            {state.status === 'loading' && <Typography as="p" size="xs" color="muted">Loading Stripe's card field…</Typography>}
            {state.message && <Typography as="p" size="xs" color="error">{state.message}</Typography>}
            <Container layout="flex" gap="xs" padding="none">
                <Button size="sm" color="secondary" disabled={state.status !== 'ready'} onClick={pay}>
                    <Icon name="FiLock" />{state.status === 'paying' ? 'Paying…' : `Pay ${formatMoney(cents)}`}
                </Button>
                <Button size="sm" variant="ghost" disabled={state.status === 'paying'} onClick={onBack}>Change amount</Button>
            </Container>
            <Typography as="p" size="xxs" color="muted">The card field is Stripe's: your card number goes straight to Stripe and never reaches this app.</Typography>
        </Container>
    );
};

const AddCredit = ({ state, onPaid }) => {
    const { error: notifyError } = useNotification();
    const [amount, setAmount] = useState(String(state.smallest / 100));
    const [busy, setBusy] = useState(false);
    const [paying, setPaying] = useState(false);
    // Coming back from Stripe with the browser's back gesture restores this page as it was left, still busy.
    useEffect(() => {
        const restored = (event) => { if (event.persisted) setBusy(false); };
        window.addEventListener('pageshow', restored);
        return () => window.removeEventListener('pageshow', restored);
    }, []);
    const cents = toCents(amount);
    const problem = !Number.isFinite(cents) || cents < state.smallest
        ? `The smallest purchase is ${formatMoney(state.smallest)}.`
        : cents > state.most ? `You can buy up to ${formatMoney(state.most)} now.` : '';

    const pay = async () => {
        if (state.inPage) {
            setPaying(true);
            return;
        }
        setBusy(true);
        try {
            const { url } = await billingService.startCheckout(cents);
            window.location.assign(url);
        } catch (error) {
            notifyError(failText(error, 'The payment page could not be opened.'));
            setBusy(false);
        }
    };

    if (paying) return <PayHere cents={cents} onPaid={() => { setPaying(false); onPaid(); }} onBack={() => setPaying(false)} />;

    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%">
            <Typography as="h3" size="sm" weight="semibold">Add credit</Typography>
            <ButtonGroup size="sm" justify="start" selectable={false} wrap>
                {AMOUNTS.filter((value) => value >= state.smallest && value <= state.most).map((value) => (
                    <Button key={value} size="sm" selected={cents === value} onClick={() => setAmount(String(value / 100))}>{formatMoney(value)}</Button>
                ))}
            </ButtonGroup>
            <Input label="Amount in US dollars" size="sm" value={amount} onChange={(event) => setAmount(event.target.value)}
                validationState={problem ? 'error' : 'default'} helpText={problem} width="100%" />
            <Typography as="p" size="xxs" color="muted">{state.inPage ? 'You pay here, in a card field run by Stripe.' : 'You pay on Stripe\'s page.'} This app never sees or keeps your card number.</Typography>
            <Button size="sm" disabled={busy || Boolean(problem)} onClick={pay}><Icon name="FiCreditCard" />Continue to payment</Button>
        </Container>
    );
};

const Adjust = ({ person, onDone }) => {
    const { success, error: notifyError } = useNotification();
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const cents = toCents(amount);
    const ready = Number.isFinite(cents) && cents !== 0 && reason.trim().length >= 3;

    const save = async () => {
        setBusy(true);
        try {
            await billingService.adjust(person.id, cents, reason.trim());
            success(`${formatMoney(cents)} for ${person.username}.`);
            closeGenie();
            onDone();
        } catch (error) {
            notifyError(failText(error, 'The adjustment was not made.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%">
            <Typography as="h3" size="sm" weight="semibold">{`Adjust ${person.username}'s credit`}</Typography>
            <Input label="US dollars, with a minus to take away" size="sm" value={amount} onChange={(event) => setAmount(event.target.value)} width="100%" />
            <Input label="Reason, shown to the person" size="sm" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} width="100%" />
            <Button size="sm" disabled={busy || !ready} onClick={save}>Add this line</Button>
        </Container>
    );
};

const LineDetail = ({ row, onDone }) => {
    const { success, error: notifyError } = useNotification();
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const { line } = row;

    const refund = async () => {
        setBusy(true);
        try {
            await billingService.refund(line.id, amount.trim() ? toCents(amount) : undefined, reason.trim());
            success('Refunded. The money goes back to the card.');
            closeGenie();
            onDone();
        } catch (error) {
            notifyError(failText(error, 'The refund was not made.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Container layout="flex-column" gap="md" padding="none" width="100%">
            <Typography as="h3" size="sm" weight="semibold">{`${KINDS[line.kind]} of ${formatMoney(line.kind === 'hold' ? line.held : line.change)}`}</Typography>
            <Typography as="p" size="xs" color="muted">{`${new Date(line.at).toLocaleString()}${line.about ? ` · ${line.about}` : ''}`}</Typography>
            {line.short > 0 && <Typography as="p" size="xs" color="warning">{`${formatMoney(line.short)} more was owed than the credit that was left.`}</Typography>}
            {line.paid ? (
                <>
                    <Input label="Refund in US dollars (empty for all that is unspent)" size="sm" value={amount} onChange={(event) => setAmount(event.target.value)} width="100%" />
                    <Input label="Reason" size="sm" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} width="100%" />
                    <Button size="sm" color="error" disabled={busy} onClick={refund}>Refund to the card</Button>
                </>
            ) : (
                <Typography as="p" size="xs" color="muted">Only a payment can be refunded. Use an adjustment to correct anything else.</Typography>
            )}
        </Container>
    );
};

const People = () => {
    const { error: notifyError } = useNotification();
    const [search, setSearch] = useState('');
    const [found, setFound] = useState(null);
    const [account, setAccount] = useState(null);

    const find = async () => {
        if (!search.trim()) return;
        try {
            setFound((await billingService.findPeople(search.trim())).people);
        } catch (error) {
            notifyError(failText(error, 'People could not be searched.'));
        }
    };

    const open = useCallback(async (id, before) => {
        try {
            const result = await billingService.getPerson(id, before ? { before } : undefined);
            setAccount((current) => (before && current ? { ...result, lines: [...current.lines, ...result.lines] } : result));
        } catch (error) {
            notifyError(failText(error, 'This ledger could not be read.'));
        }
    }, [notifyError]);

    return (
        <Card layout="flex-column" gap="md" padding="lg" width="100%" hover={false}>
            <Typography as="h2" size="md" weight="semibold" font="secondary">People's credit</Typography>
            <Container layout="flex" gap="xs" align="end" padding="none" width="100%">
                <Input label="Start of a username or email" size="sm" value={search} onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && find()} flexFill />
                <Button size="sm" color="secondary" onClick={find}><Icon name="FiSearch" />Find</Button>
            </Container>
            {found && (found.length === 0 ? (
                <Typography as="p" size="xs" color="muted">Nobody matches.</Typography>
            ) : (
                <ButtonGroup size="xs" justify="start" selectable={false} wrap>
                    {found.map((person) => (
                        <Button key={person.id} size="xs" selected={account?.person.id === person.id}
                            onClick={() => open(person.id)}>{`${person.username} · ${formatMoney(person.balance)}`}</Button>
                    ))}
                </ButtonGroup>
            ))}
            {account && (
                <>
                    <Container layout="flex" justify="between" align="end" gap="md" padding="none" width="100%">
                        <Container layout="flex-column" gap="xs" padding="none">
                            <Typography as="p" size="xs" weight="medium">{`${account.person.username} · ${account.person.email}`}</Typography>
                            <Totals balance={account.balance} held={account.held} />
                        </Container>
                        <Button size="sm" color="secondary"
                            genie={{ trigger: 'click', variant: 'popover', width: '360px', padding: 'lg', content: <Adjust person={account.person} onDone={() => open(account.person.id)} /> }}>
                            <Icon name="FiEdit3" />Adjust
                        </Button>
                    </Container>
                    <Ledger lines={account.lines} more={account.more} onMore={() => open(account.person.id, account.lines.at(-1).seq)}
                        genie={{ trigger: 'click', variant: 'popover', width: '360px', padding: 'lg', content: (row) => <LineDetail row={row} onDone={() => open(account.person.id)} /> }} />
                </>
            )}
        </Card>
    );
};

const BillingPage = () => {
    const { hasRole } = useAuth();
    const { success, info, error: notifyError } = useNotification();
    const [params, setParams] = useSearchParams();
    const [state, setState] = useState(null);
    const [ledger, setLedger] = useState({ lines: [], more: false });
    const paid = params.get('paid');

    const load = useCallback(async () => {
        try {
            const next = await billingService.getState();
            setState(next);
            if (next.on) setLedger(await billingService.getLines());
            return next;
        } catch (error) {
            notifyError(failText(error, 'Billing could not be loaded.'));
            return null;
        }
    }, [notifyError]);

    useEffect(() => {
        load();
        // A page restored by the back gesture shows what it showed before paying; read the balance again.
        const restored = (event) => { if (event.persisted) load(); };
        window.addEventListener('pageshow', restored);
        return () => window.removeEventListener('pageshow', restored);
    }, [load]);

    // Stripe tells the server, not this page, so after paying the balance is read again until the credit shows.
    const afterPaying = () => {
        success('Payment received. Your credit shows here in a moment.');
        let tries = 0;
        const timer = setInterval(async () => {
            tries += 1;
            await load();
            if (tries >= 8) clearInterval(timer);
        }, 2500);
        return () => clearInterval(timer);
    };

    useEffect(() => {
        if (!paid) return undefined;
        setParams({}, { replace: true });
        if (paid !== 'yes') {
            info('The payment was cancelled. Nothing was charged.');
            return undefined;
        }
        return afterPaying();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const showEarlier = async () => {
        try {
            const next = await billingService.getLines({ before: ledger.lines.at(-1).seq });
            setLedger({ lines: [...ledger.lines, ...next.lines], more: next.more });
        } catch (error) {
            notifyError(failText(error, 'Earlier lines could not be read.'));
        }
    };

    if (state && !state.on) return <Navigate to="/" replace />;

    const canBuy = state?.emailVerified && state.most >= state.smallest;

    return (
        <Page title="Billing" lead="Prepaid credit, and a line for everything that adds to it or spends it." gap="lg">
            {!state ? <CircularProgress size="sm" /> : (
                <>
                    <Card layout="flex-column" gap="md" padding="lg" width="100%" hover={false}>
                        {!state.real && <Typography as="p" size="xs" color="warning">Test money: no card is charged here, and this credit counts only where billing is in test mode.</Typography>}
                        <Container layout="flex" justify="between" align="end" gap="md" padding="none" width="100%">
                            <Totals balance={state.balance} held={state.held} />
                            <Button size="sm" disabled={!canBuy}
                                genie={canBuy ? { trigger: 'click', variant: 'popover', width: state.inPage ? '420px' : '360px', padding: 'lg', content: <AddCredit state={state} onPaid={afterPaying} /> } : null}>
                                <Icon name="FiPlus" />Add credit
                            </Button>
                        </Container>
                        {!state.emailVerified && <Typography as="p" size="xs" color="warning">Verify your email address to buy credit.</Typography>}
                        {state.emailVerified && state.newAccount && (
                            <Typography as="p" size="xxs" color="muted">
                                {state.most >= state.smallest
                                    ? `A new account can buy up to ${formatMoney(state.most)} for now. The limit goes after its first week.`
                                    : 'A new account can buy no more for now. The limit goes after its first week.'}
                            </Typography>
                        )}
                    </Card>
                    <Card layout="flex-column" gap="md" padding="lg" width="100%" hover={false}>
                        <Typography as="h2" size="md" weight="semibold" font="secondary">Ledger</Typography>
                        <Ledger lines={ledger.lines} more={ledger.more} onMore={showEarlier} />
                    </Card>
                    {(hasRole('ADMIN') || hasRole('OWNER')) && <People />}
                </>
            )}
        </Page>
    );
};

export default BillingPage;
