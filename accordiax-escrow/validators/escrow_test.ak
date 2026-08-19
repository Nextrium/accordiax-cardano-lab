use aiken/crypto.{VerificationKeyHash}
use cardano/address
use cardano/assets
use cardano/transaction.{
  InlineDatum,
  Input,
  Output,
  OutputReference,
  Transaction,
}

use escrow

const buyer: VerificationKeyHash =
  #"0000000000000000000000000000000000000000000000000000000000000000"

const seller: VerificationKeyHash =
  #"1111111111111111111111111111111111111111111111111111111111111111"

const test_policy_id: assets.PolicyId =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const test_asset_name: assets.AssetName =
  #"4e5854455354"

const escrow_quantity: Int =
  1_000

const escrow_value =
  assets.from_asset(
    test_policy_id,
    test_asset_name,
    escrow_quantity,
  )

const placeholder_utxo =
  OutputReference {
    transaction_id:
      transaction.placeholder.id,
    output_index: 0,
  }

const buyer_address =
  address.from_verification_key(
    buyer,
  )

const seller_address =
  address.from_verification_key(
    seller,
  )

const escrow_output =
  Output {
    address: buyer_address,
    value: escrow_value,
    datum: InlineDatum(
      placeholder_utxo,
    ),
    reference_script: None,
  }

const escrow_input =
  Input {
    output_reference:
      placeholder_utxo,
    output:
      escrow_output,
  }

fn datum() -> escrow.EscrowDatum {
  escrow.EscrowDatum {
    buyer,
    seller,
    policy_id:
      test_policy_id,
    asset_name:
      test_asset_name,
    quantity:
      escrow_quantity,
  }
}

fn seller_output(
  quantity: Int,
) -> Output {
  Output {
    address:
      seller_address,
    value:
      assets.from_asset(
        test_policy_id,
        test_asset_name,
        quantity,
      ),
    datum:
      InlineDatum(
        placeholder_utxo,
      ),
    reference_script:
      None,
  }
}

fn buyer_output(
  quantity: Int,
) -> Output {
  Output {
    address:
      buyer_address,
    value:
      assets.from_asset(
        test_policy_id,
        test_asset_name,
        quantity,
      ),
    datum:
      InlineDatum(
        placeholder_utxo,
      ),
    reference_script:
      None,
  }
}

fn transaction_with(
  outputs: List<Output>,
  signers: List<VerificationKeyHash>,
) -> Transaction {
  Transaction {
    ..transaction.placeholder,
    inputs:
      [escrow_input],
    outputs,
    extra_signatories:
      signers,
  }
}

test release_with_correct_value_and_seller() {
  escrow.escrow.spend(
    Some(datum()),
    escrow.Release,
    placeholder_utxo,
    transaction_with(
      [seller_output(
        escrow_quantity,
      )],
      [seller],
    ),
  )
}

test release_rejects_wrong_amount() {
  !escrow.escrow.spend(
    Some(datum()),
    escrow.Release,
    placeholder_utxo,
    transaction_with(
      [seller_output(999)],
      [seller],
    ),
  )
}

test release_rejects_wrong_signer() {
  !escrow.escrow.spend(
    Some(datum()),
    escrow.Release,
    placeholder_utxo,
    transaction_with(
      [seller_output(
        escrow_quantity,
      )],
      [buyer],
    ),
  )
}

test release_rejects_wrong_destination() {
  !escrow.escrow.spend(
    Some(datum()),
    escrow.Release,
    placeholder_utxo,
    transaction_with(
      [buyer_output(
        escrow_quantity,
      )],
      [seller],
    ),
  )
}

test refund_with_correct_value_and_buyer() {
  escrow.escrow.spend(
    Some(datum()),
    escrow.Refund,
    placeholder_utxo,
    transaction_with(
      [buyer_output(
        escrow_quantity,
      )],
      [buyer],
    ),
  )
}

test refund_rejects_wrong_amount() {
  !escrow.escrow.spend(
    Some(datum()),
    escrow.Refund,
    placeholder_utxo,
    transaction_with(
      [buyer_output(999)],
      [buyer],
    ),
  )
}

test refund_rejects_wrong_signer() {
  !escrow.escrow.spend(
    Some(datum()),
    escrow.Refund,
    placeholder_utxo,
    transaction_with(
      [buyer_output(
        escrow_quantity,
      )],
      [seller],
    ),
  )
}

test refund_rejects_wrong_destination() {
  !escrow.escrow.spend(
    Some(datum()),
    escrow.Refund,
    placeholder_utxo,
    transaction_with(
      [seller_output(
        escrow_quantity,
      )],
      [buyer],
    ),
  )
}