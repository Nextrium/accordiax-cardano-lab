use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address
use cardano/assets
use cardano/transaction.{
  InlineDatum,
  Output,
  OutputReference,
  Transaction,
}

pub type EscrowDatum {
  buyer: VerificationKeyHash,
  seller: VerificationKeyHash,
  policy_id: assets.PolicyId,
  asset_name: assets.AssetName,
  quantity: Int,
}

pub type EscrowRedeemer {
  Release
  Refund
}

fn signed_by(
  tx: Transaction,
  signer: VerificationKeyHash,
) -> Bool {
  list.has(
    tx.extra_signatories,
    signer,
  )
}

fn beneficiary_output_quantity(
  outputs: List<Output>,
  own_ref: OutputReference,
  beneficiary: VerificationKeyHash,
  policy_id: assets.PolicyId,
  asset_name: assets.AssetName,
) -> Int {
  let beneficiary_address =
    address.from_verification_key(
      beneficiary,
    )

  when list.find(
    outputs,
    fn(output) {
      output.address == beneficiary_address &&
      when output.datum is {
        InlineDatum(output_datum) ->
          if output_datum is OutputReference {
            own_ref == output_datum
          } else {
            False
          }

        _ ->
          False
      }
    },
  ) is {
    Some(output) ->
      assets.quantity_of(
        output.value,
        policy_id,
        asset_name,
      )

    None ->
      0
  }
}

validator escrow {
  spend(
    datum: Option<EscrowDatum>,
    redeemer: EscrowRedeemer,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(EscrowDatum {
      buyer,
      seller,
      policy_id,
      asset_name,
      quantity,
    }) = datum

    expect Some(own_input) =
      list.find(
        self.inputs,
        fn(input) {
          input.output_reference == own_ref
        },
      )

    let escrowed_quantity =
      assets.quantity_of(
        own_input.output.value,
        policy_id,
        asset_name,
      )

    let escrow_contains_expected_value =
      escrowed_quantity >= quantity

    when redeemer is {
      Release -> {
        let authorized =
          signed_by(
            self,
            seller,
          )

        let paid_quantity =
          beneficiary_output_quantity(
            self.outputs,
            own_ref,
            seller,
            policy_id,
            asset_name,
          )

        authorized &&
        escrow_contains_expected_value &&
        paid_quantity == quantity
      }

      Refund -> {
        let authorized =
          signed_by(
            self,
            buyer,
          )

        let paid_quantity =
          beneficiary_output_quantity(
            self.outputs,
            own_ref,
            buyer,
            policy_id,
            asset_name,
          )

        authorized &&
        escrow_contains_expected_value &&
        paid_quantity == quantity
      }
    }
  }
}