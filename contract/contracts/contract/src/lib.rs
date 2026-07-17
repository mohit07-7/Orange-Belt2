#![no_std]
use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, Vec,
};

// Define the interface so this contract can talk to your NFT contract
#[contractclient(name = "NFTClient")]
pub trait NFTTrait {
    fn transfer(env: Env, from: Address, to: Address, token_id: i128);
    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: i128);
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AuctionError {
    NotFound = 1,
    NotEnded = 2,
    AlreadyClaimed = 3,
    BidTooLow = 4,
    NotActive = 5,
    NotWinner = 6,
    NoBids = 7,
    HasBids = 8,
    NotOnAllowlist = 9,
    NotAuthorized = 10,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Auction {
    pub id: u64,
    pub creator: Address,
    pub token: Address, // NFT Contract Address
    pub token_id: i128, 
    pub bid_token: Address, // Payment Token Address (e.g., USDC, XLM)
    pub start_price: i128,
    pub min_bid_increment: i128,
    pub highest_bid: i128,
    pub highest_bidder: Address,
    pub start_time: u64,
    pub end_time: u64,
    pub ended: bool,
    pub claimed: bool,
    pub is_private: bool,
    pub allowlist: Vec<Address>,
}

#[contracttype]
pub enum DataKey {
    Admin,
    NextId,
    Auction(u64),
}

// --- EVENTS ---
#[contractevent]
pub struct AuctionCreated { pub creator: Address, pub auction_id: u64, pub token_id: i128, pub is_private: bool }
#[contractevent]
pub struct BidPlaced { pub auction_id: u64, pub bidder: Address, pub amount: i128 }
#[contractevent]
pub struct AuctionClaimed { pub auction_id: u64, pub winner: Address, pub creator: Address, pub amount: i128, pub token_id: i128 }
#[contractevent]
pub struct AuctionReclaimed { pub auction_id: u64, pub creator: Address, pub token_id: i128 }
#[contractevent]
pub struct AuctionCancelled { pub auction_id: u64, pub creator: Address, pub token_id: i128 }

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::NextId) {
            return;
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextId, &1u64);
    }

    pub fn create_auction(
        env: Env, creator: Address, token: Address, token_id: i128, bid_token: Address,
        start_price: i128, min_bid_increment: i128, start_time: u64, end_time: u64,
        is_private: bool, allowlist: Vec<Address>,
    ) -> Result<u64, AuctionError> {
        creator.require_auth();

        let now = env.ledger().timestamp();
        if start_time >= end_time || end_time <= now {
            return Err(AuctionError::NotActive);
        }

        // Pull the NFT from the Creator into the Auction Escrow
        NFTClient::new(&env, &token).transfer_from(
            &env.current_contract_address(), // spender (this contract)
            &creator,                        // from (the user)
            &env.current_contract_address(), // to (this contract holds it in escrow)
            &token_id, 
        );

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1u64);

        let auction = Auction {
            id, creator: creator.clone(), token, token_id, bid_token, start_price,
            min_bid_increment, highest_bid: 0i128, highest_bidder: creator.clone(),
            start_time, end_time, ended: false, claimed: false, is_private, allowlist,
        };

        // Write to Persistent Storage to avoid memory bloat
        env.storage().persistent().set(&DataKey::Auction(id), &auction);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        AuctionCreated { creator, auction_id: id, token_id, is_private }.publish(&env);
        
        Ok(id)
    }

    pub fn place_bid(env: Env, bidder: Address, auction_id: u64, amount: i128) -> Result<(), AuctionError> {
        bidder.require_auth();

        let mut auction: Auction = env.storage().persistent().get(&DataKey::Auction(auction_id))
            .ok_or(AuctionError::NotFound)?;

        if auction.is_private && !auction.allowlist.contains(&bidder) {
            return Err(AuctionError::NotOnAllowlist);
        }

        let now = env.ledger().timestamp();
        if now < auction.start_time || now > auction.end_time || auction.ended || auction.claimed {
            return Err(AuctionError::NotActive);
        }

        let min_bid = if auction.highest_bid == 0 { auction.start_price + 1 } else { auction.highest_bid + auction.min_bid_increment };
        if amount < min_bid {
            return Err(AuctionError::BidTooLow);
        }

        // Refund previous highest bidder
        if auction.highest_bid > 0 {
            token::Client::new(&env, &auction.bid_token).transfer(
                &env.current_contract_address(), &auction.highest_bidder, &auction.highest_bid,
            );
        }

        // Pull funds from new bidder
        token::Client::new(&env, &auction.bid_token).transfer(
            &bidder, &env.current_contract_address(), &amount,
        );

        auction.highest_bid = amount;
        auction.highest_bidder = bidder.clone();
        
        env.storage().persistent().set(&DataKey::Auction(auction_id), &auction);
        BidPlaced { auction_id, bidder, amount }.publish(&env);
        Ok(())
    }

    pub fn claim_winning(env: Env, auction_id: u64) -> Result<(), AuctionError> {
        let mut auction: Auction = env.storage().persistent().get(&DataKey::Auction(auction_id))
            .ok_or(AuctionError::NotFound)?;

        auction.highest_bidder.require_auth();

        if env.ledger().timestamp() <= auction.end_time || auction.claimed || auction.highest_bid == 0 {
            return Err(AuctionError::NotEnded);
        }

        auction.ended = true;
        auction.claimed = true;

        // Push NFT from escrow to the winner
        NFTClient::new(&env, &auction.token).transfer(
            &env.current_contract_address(), &auction.highest_bidder, &auction.token_id, 
        );
        
        // Push funds from escrow to the creator
        token::Client::new(&env, &auction.bid_token).transfer(
            &env.current_contract_address(), &auction.creator, &auction.highest_bid,
        );

        env.storage().persistent().set(&DataKey::Auction(auction_id), &auction);
        
        AuctionClaimed {
            auction_id, winner: auction.highest_bidder, creator: auction.creator, amount: auction.highest_bid, token_id: auction.token_id,
        }.publish(&env);
        
        Ok(())
    }

    pub fn reclaim_unsold(env: Env, auction_id: u64) -> Result<(), AuctionError> {
        let mut auction: Auction = env.storage().persistent().get(&DataKey::Auction(auction_id))
            .ok_or(AuctionError::NotFound)?;

        auction.creator.require_auth();

        if env.ledger().timestamp() <= auction.end_time || auction.claimed || auction.highest_bid > 0 {
            return Err(AuctionError::NotEnded);
        }

        auction.ended = true;
        auction.claimed = true;

        // Return NFT to creator
        NFTClient::new(&env, &auction.token).transfer(
            &env.current_contract_address(), &auction.creator, &auction.token_id, 
        );

        env.storage().persistent().set(&DataKey::Auction(auction_id), &auction);
        AuctionReclaimed { auction_id, creator: auction.creator, token_id: auction.token_id }.publish(&env);
        Ok(())
    }

    pub fn cancel_auction(env: Env, auction_id: u64) -> Result<(), AuctionError> {
        let auction: Auction = env.storage().persistent().get(&DataKey::Auction(auction_id))
            .ok_or(AuctionError::NotFound)?;

        auction.creator.require_auth();

        if auction.highest_bid > 0 {
            return Err(AuctionError::HasBids);
        }

        // Return NFT to creator
        NFTClient::new(&env, &auction.token).transfer(
            &env.current_contract_address(), &auction.creator, &auction.token_id,
        );

        env.storage().persistent().remove(&DataKey::Auction(auction_id));
        AuctionCancelled { auction_id, creator: auction.creator, token_id: auction.token_id }.publish(&env);
        Ok(())
    }

    pub fn get_auction(env: Env, auction_id: u64) -> Result<Auction, AuctionError> {
        env.storage().persistent().get(&DataKey::Auction(auction_id)).ok_or(AuctionError::NotFound)
    }

    // Secured & Safe Admin Cleanup Function
    pub fn admin_delete_auction(env: Env, admin: Address, auction_id: u64) -> Result<(), AuctionError> {
        admin.require_auth();

        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin)
            .ok_or(AuctionError::NotAuthorized)?;
            
        if admin != stored_admin {
            return Err(AuctionError::NotAuthorized);
        }

        let auction: Auction = env.storage().persistent().get(&DataKey::Auction(auction_id))
            .ok_or(AuctionError::NotFound)?;

        // Safety Measure: If the auction is live, refund the bidder and return the NFT
        if !auction.ended && !auction.claimed {
            if auction.highest_bid > 0 {
                token::Client::new(&env, &auction.bid_token).transfer(
                    &env.current_contract_address(), &auction.highest_bidder, &auction.highest_bid,
                );
            }
            
            NFTClient::new(&env, &auction.token).transfer(
                &env.current_contract_address(), &auction.creator, &auction.token_id,
            );
        }

        env.storage().persistent().remove(&DataKey::Auction(auction_id));
        Ok(())
    }

    pub fn get_next_id(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(1u64)
    }
}