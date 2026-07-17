#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};
use soroban_sdk::token::Client as TokenClient;
use soroban_sdk::token::StellarAssetClient as AssetClient;

// Helper function to create mock tokens for testing
fn create_token<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, AssetClient<'a>) {
    let contract_id = env.register_stellar_asset_contract(admin.clone());
    (
        TokenClient::new(env, &contract_id),
        AssetClient::new(env, &contract_id),
    )
}

#[test]
fn test_successful_auction_and_claim() {
    let env = Env::default();
    env.mock_all_auths(); // Bypass strict signature checks for testing

    // Setup accounts
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);

    // Setup tokens (Item Token and Bid Token like USDC/XLM)
    let (item_token, item_admin) = create_token(&env, &admin);
    let (bid_token, bid_admin) = create_token(&env, &admin);

    // Mint 1 Item to the Creator
    item_admin.mint(&creator, &1);
    
    // Mint Bidding Funds to the bidders
    bid_admin.mint(&bidder1, &100);
    bid_admin.mint(&bidder2, &200);

    // Register our Auction Contract
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    client.init();

    // Set ledger time to "1000"
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    // 1. Create Auction (Start: 1000, End: 2000, Start Price: 50)
    let auction_id = client.create_auction(
        &creator,
        &item_token.address,
        &bid_token.address,
        &50,
        &1000,
        &2000,
    );

    assert_eq!(item_token.balance(&creator), 0); // Item locked
    assert_eq!(item_token.balance(&contract_id), 1); 

    // 2. Bidder 1 Places Bid (50)
    client.place_bid(&bidder1, &auction_id, &50);
    assert_eq!(bid_token.balance(&bidder1), 50); // 100 - 50 locked
    assert_eq!(bid_token.balance(&contract_id), 50);

    // 3. Bidder 2 Outbids Bidder 1 (100)
    client.place_bid(&bidder2, &auction_id, &100);
    
    // Bidder 1 should automatically be refunded!
    assert_eq!(bid_token.balance(&bidder1), 100); 
    assert_eq!(bid_token.balance(&bidder2), 100); // 200 - 100 locked
    assert_eq!(bid_token.balance(&contract_id), 100);

    // 4. Time travels past end_time
    env.ledger().with_mut(|li| {
        li.timestamp = 2001;
    });

    // 5. Claim Winning (Permissionless)
    client.claim_winning(&auction_id);

    // Verify final balances
    assert_eq!(item_token.balance(&bidder2), 1); // Bidder 2 gets the item
    assert_eq!(bid_token.balance(&creator), 100); // Creator gets the 100 tokens
}

#[test]
fn test_reclaim_unsold_auction() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let (item_token, item_admin) = create_token(&env, &admin);
    let (bid_token, _) = create_token(&env, &admin);

    item_admin.mint(&creator, &1);

    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);
    client.init();

    env.ledger().with_mut(|li| li.timestamp = 1000);

    let auction_id = client.create_auction(
        &creator,
        &item_token.address,
        &bid_token.address,
        &50,
        &1000,
        &2000,
    );

    // Time travels past end_time with zero bids
    env.ledger().with_mut(|li| li.timestamp = 2001);

    // Reclaim unsold item
    client.reclaim_unsold(&auction_id);

    // Creator should get their item back
    assert_eq!(item_token.balance(&creator), 1);
}