import { sharedAPI as api } from './app.client.js';

export const formatMoney = (cents) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

let asked = null;

export const billingService = {
    getState: () => api.get('/billing'),
    getLines: (params) => api.get('/billing/lines', { params }),
    startCheckout: (amount) => api.post('/billing/checkout', { amount }),
    findPeople: (find) => api.get('/billing/people', { params: { find } }),
    getPerson: (id, params) => api.get(`/billing/people/${id}`, { params }),
    adjust: (id, amount, reason) => api.post(`/billing/people/${id}/adjustments`, { amount, reason }),
    refund: (lineId, amount, reason) => api.post(`/billing/lines/${lineId}/refund`, { amount, reason }),

    // Whether this app has billing at all, asked once per signed-in person.
    isOn(userId) {
        if (asked?.userId !== userId) {
            asked = { userId, answer: api.get('/billing').then((state) => Boolean(state?.on)).catch(() => false) };
        }
        return asked.answer;
    }
};

export default billingService;
