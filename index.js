require('dotenv').config();
const axios = require('axios');

// Set the Solana/Helius RPC endpoint from the environment variables
const SOLANA_RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT;
const usdcMintAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const usdtMintAddress = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

// Function to get the Solana balance of a wallet
async function getBalanceSOL(walletAddress) {
    const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [walletAddress]
    };

    const response = await makeRequestWithBackoff(payload);
    return response?.data?.result.value / 1e9; // Convert lamports to SOL
}
// Function to get the token balance of a wallet
async function getTokenBalance(walletAddress, tokenMintAddress) {
    const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
            walletAddress,
            {
                mint: tokenMintAddress
            },
            {
                encoding: 'jsonParsed'
            }
        ]
    };
    const response = await makeRequestWithBackoff(payload);
    const accounts = response?.data?.result.value;
    if (accounts.length === 0) {
        return 0;
    }
    return accounts[0].account.data.parsed.info.tokenAmount.uiAmount;
}
// Function to get the largest token accounts of a token
async function getTokenLargestAccounts(tokenMintAddress) {
    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenLargestAccounts",
        params: [
            tokenMintAddress,
            { commitment: "finalized" }
        ]
    };
    const response = await makeRequestWithBackoff(payload);
    const accounts = response?.data?.result.value;
    return accounts; // Returns the top 20 holders
}

async function getAccountOwner(tokenAccount) {
    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [
            tokenAccount,
            { encoding: "jsonParsed" }
        ]
    };
    const response = await makeRequestWithBackoff(payload)
    const owner = response?.data?.result.value.data.parsed.info.owner;
    return owner;
}

async function makeRequestWithBackoff(payload) {
    const maxRetries = 5;
    let attempt = 0;
    let delay = 1000; // Initial delay of 1 second

    while (attempt < maxRetries) {
        try {
            const response = await axios.post(SOLANA_RPC_ENDPOINT, payload, {
                headers: {
                    "Content-Type": "application/json"
                }
            });
            return response;

        } catch (error) {
            if (error.response && error.response.status === 429) {
                // Rate limit hit, wait and retry
                // console.warn(`Rate limited, retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
                attempt++;
            } else {
                // Log error and return null for other errors
                console.error(`Error fetching owner for token account ${tokenAccount}:`, error);
                return null;
            }
        }
    }
}
// Function to get owners of token accounts and gather their portfolios
async function processTopHolders(tokenAccounts) {
    console.log("Processing top holders:");

    for (const tokenAccount of tokenAccounts) {
        console.log("-------------------");
        const accountOwner = await getAccountOwner(tokenAccount.address)
        try {
            console.log(accountOwner)
            console.log("Token Balance: ", tokenAccount.amount)
            const solBalance = await getBalanceSOL(accountOwner);
            console.log(`SOL Balance: ${solBalance} SOL`);

            const usdcBalance = await getTokenBalance(accountOwner, usdcMintAddress);
            console.log(`USDC Balance: ${usdcBalance} USDC`);

            const usdtBalance = await getTokenBalance(accountOwner, usdtMintAddress);
            console.log(`USDT Balance: ${usdtBalance} USDT`);
        } catch (error) {
            console.error('Error fetching balances:', error);
        }
    }
}
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error("Error: Please provide a token mint address as a command-line argument.");
        process.exit(1);
    }

    const TOKEN_MINT_ADDRESS = args[0];
    const topTokenAccounts = await getTokenLargestAccounts(TOKEN_MINT_ADDRESS);
    await processTopHolders(topTokenAccounts);
}

main();
