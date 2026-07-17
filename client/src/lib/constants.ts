export const NETWORK = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
} as const;


  export const CONTRACT_ADDRESS = "CBOWY2IVHYVG2WQKJV6D32IZIQMXLACNPU3MA4LVX5FRZ5SKCL27IMHZ";
/** NFT Contract — NonFungibleToken (Soroban)
 * Handles mint/transfer/ownerOf for IPFS-linked assets.
 */
export const NFT_CONTRACT_ADDRESS = "CAIGJDU3F54SCETYVG25SIGDIVLQSYVB3DTPHCBULRPWC3SWSIJXLIK6";


// Default bidding token used for balance display in the Navbar. 
export const DEFAULT_BID_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; // XLM (Stellar Asset Contract)

export const STELLAR_EXPIRATION_MARGIN = 300; // seconds added to TimeBounds


export const AUCTION_IDS_KEY = "zenith_known_auction_ids";

/** Only this wallet address may access the admin panel. */
export const ADMIN_WALLET = "GANNJIR376DS6CMKK6JZ57TFAMZCJWTIL4RPND6X6P5RKMHFFZD32WTC";
