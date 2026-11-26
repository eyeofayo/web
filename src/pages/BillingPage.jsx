import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Page, Container, Card, Typography, Button, ButtonGroup, Badge, Icon, Input, Data, CircularProgress } from '@components/Components';
import { useNotification } from '@contexts/NotificationContext';
import { useAuth } from '@contexts/AuthContext';
import { billingService, formatMoney } from '../client/billing.client';

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

const AddCredit = ({ state }) => {
    const { error: notifyError } = useNotification();
    const [amount, setAmount] = useState(String(state.smallest / 100));
    const [busy, setBusy] = useState(false);
    const cents = toCents(amount);
    const problem = !Number.isFinite(cents) || cents < state.smallest
        ? `The smallest purchase is ${formatMoney(state.smallest)}.`
        : cents > state.most ? `You can buy up to ${formatMoney(state.most)} now.` : '';

    const pay = async () => {
        setBusy(true);
        try {
            const { url } = await billingService.startCheckout(cents);
            window.location.assign(url);
        } catch (error) {
            notifyError(failText(error, 'The payment page could not be opened.'));
            setBusy(false);
        }
    };

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
            <Typography as="p" size="xxs" color="muted">You pay on Stripe's page. This app never sees or keeps your card number.</Typography>
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
    }, [load]);

    // Stripe tells the server, not this page, so after paying the balance is read again until the credit shows.
    useEffect(() => {
        if (!paid) return undefined;
        setParams({}, { replace: true });
        if (paid !== 'yes') {
            info('The payment was cancelled. Nothing was charged.');
            return undefined;
        }
        success('Payment received. Your credit shows here in a moment.');
        let tries = 0;
        const timer = setInterval(async () => {
            tries += 1;
            await load();
            if (tries >= 8) clearInterval(timer);
        }, 2500);
        return () => clearInterval(timer);
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
                                genie={canBuy ? { trigger: 'click', variant: 'popover', width: '360px', padding: 'lg', content: <AddCredit state={state} /> } : null}>
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
