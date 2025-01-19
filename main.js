import Mailjs from '@cemalgnlts/mailjs';
import FormData from 'form-data';
import axios from 'axios';
import log from './utils/logger.js'
import beddus from './utils/banner.js'
import {
    delay,
    saveToFile,
    newAgent,
    readFile
} from './utils/helper.js';
import readline from 'readline';

function getInviteCode() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question('Enter your invite code: ', (code) => {
            rl.close();
            resolve(code);
        });
    });
}

const mailjs = new Mailjs();

async function sendOtp(email, proxy) {
    const agent = newAgent(proxy);
    const form = new FormData();
    form.append('email', email);
    form.append('ci_csrf_token', '');

    const headers = {
        ...form.getHeaders(),
    };

    try {
        const response = await axios.post('https://arichain.io/api/Email/send_valid_email', form, {
            headers: headers,
            httpsAgent: agent,
        });
        log.info('Sending OTP Result:', response.data);
        return response.data;
    } catch (error) {
        log.error('Error When Sending OTP got error code:', error.status);
        return null;
    }
}

async function checkCode(email, code, proxy) {
    const agent = newAgent(proxy);
    const form = new FormData();
    form.append('email', email);
    form.append('code', code);
    form.append('ci_csrf_token', '');

    const headers = {
        ...form.getHeaders(),
    };

    try {
        const response = await axios.post('https://arichain.io/api/Email/check_valid_code', form, {
            headers: headers,
            httpsAgent: agent,
        });
        log.info('Checking valid code Result:', response.data);
        return code;
    } catch (error) {
        log.error('Error when checking got error code:', error.status);
        return code;
    }
}

async function register(email, pw, pw_re, valid_code, invite_code, proxy) {
    const agent = newAgent(proxy);
    const form = new FormData();
    form.append('email', email);
    form.append('pw', pw);
    form.append('pw_re', pw_re);
    form.append('valid_code', valid_code);
    form.append('invite_code', invite_code);
    form.append('ci_csrf_token', '');

    const headers = {
        ...form.getHeaders(),
    };

    try {
        const response = await axios.post('https://arichain.io/api/Account/signup', form, {
            headers: headers,
            httpsAgent: agent,
        });
        log.info('Register Result:', response.data);
        return response.data;
    } catch (error) {
        log.error(`Error when registering ${email} got error code:`, error.status);
        return null;
    }
}

async function waitForEmail(mailjs, retries = 10, delay = 5000) {
    for (let i = 0; i < retries; i++) {
        const messages = await mailjs.getMessages();
        if (messages.data.length > 0) {
            const message = messages.data[0];
            const fullMessage = await mailjs.getMessage(message.id);

            const match = fullMessage.data.text.match(/Please complete the email address verification with this code.\s+Thank you.\s+(\d{6})/);
            if (match) return match[1];
        }
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw new Error('Verification email not received.');
}

async function main() {
    log.info(beddus)
    await delay(3)

    const proxies = await readFile("proxy.txt")
    if (proxies.length === 0) {
        log.warn(`Running without proxy...`);
    }

    let proxyIndex = 0
    const invite_code = await getInviteCode() // `678b90d462361`
    log.warn(`Starting Running Program [ CTRL + C ] to exit...`)

    while (true) {
        try {
            const proxy = proxies[proxyIndex] || null;
            proxyIndex = (proxyIndex + 1) % proxies.length
            let account = await mailjs.createOneAccount();
            while (!account?.data?.username) {
                log.warn('Failed To Generate New Email, Retrying...');
                await delay(3)
                account = await mailjs.createOneAccount();
            }

            const email = account.data.username;
            const pass = account.data.password;
            const password = `${pass}Ari321#`

            log.info('Trying to register email:', `${email} with invited Code: ${invite_code}`);
            log.info('Register Using Proxy:', proxy || "without proxy");
            let sendingOtp = await sendOtp(email, proxy);
            while (!sendingOtp) {
                log.warn('Failed to send OTP, Retrying...');
                await delay(3)
                sendingOtp = await sendOtp(email, proxy);
            }

            await mailjs.login(email, password);
            const otp = await waitForEmail(mailjs)
            log.info(`Email ${email} received OTP:`, otp);
            const valid_code = await checkCode(email, otp, proxy);

            if (valid_code) {
                let response = await register(
                    email,
                    password,
                    password,
                    valid_code,
                    invite_code,
                    proxy
                );
                while (!response) {
                    log.warn(`Failed to registering ${email}, retrying...`)
                    await delay(1)
                    response = await register(
                        email,
                        password,
                        password,
                        valid_code,
                        invite_code,
                        proxy
                    );
                }
                await saveToFile('accounts.txt', `${email}|${password}`)
            }

        } catch (error) {
            log.error(`Error when registering ${email}:`, error.message);
        }
        await delay(3)
    }
}

main()