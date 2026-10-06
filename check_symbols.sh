#!/bin/bash
cd "$(dirname "$0")"

SYMBOLS=(
"EcosystemAd"
"SponsorRule"
"sponsorRules"
"matchSponsor"
"ecosystemAds"
"normalizePhoneNumberServer"
"hashPhoneNumberServer"
"REALITY_RULES"
"ParsedBirthDate"
"parseBirthDate"
"computeAge"
"db"
"storage"
"FieldValue"
"loadUserReferenceImage"
"buildSessionLogPrompt"
"WordTimestamp"
"generatePostAudio"
"resolveConversationVoices"
"MessageBoundary"
"ConversationAudioResult"
"generateConversationAudio"
"generateSingleImage"
"generateVerdictImage"
"uploadImageBuffer"
"StoryboardOptions"
"generateStoryboardImages"
"MessageImagePromptOptions"
"generateMessageImagePrompts"
"GenerateMessageImagesOptions"
"generateMessageImages"
"BuildMessageImageBatchOptions"
"buildMessageImageBatchRequests"
"StyleCategory"
"VisualStyle"
"VISUAL_STYLES"
"PHOTOGRAPHER_CATALOG"
"getVisualStyle"
"BatchJobRecord"
"createBatchRecord"
"getActiveBatchJobs"
"updateBatchJobState"
"deleteBatchRecord"
"generateVoiceDesignPrompt"
"ProcessPostInput"
"ProcessPostResult"
"processPostContent"
"generateImage"
"buildDossierPrompt"
"OPUS_MODEL"
"OPUS_FALLBACK"
"SONNET_MODEL"
"BACKUP_MODEL"
"generateWithFallback"
"streamWithFallback"
"generateTextWithFallback"
"CondensedTranscriptSchema"
"CondensedTranscript"
"CondensedMessage"
"generateCondensedTranscript"
"BuildBatchRequestOptions"
"buildBatchRequest"
"ParsedBatchResult"
"BatchStatus"
"submitImageBatch"
"pollBatchJob"
"parseBatchResults"
"ImageValidationResult"
"validateGeneratedImage"
"generateThumbnail"
)

echo "Checking symbols for usage..."
for SYMBOL in "${SYMBOLS[@]}"; do
  # find references excluding the definition line itself and import lines
  # Actually, just check if it appears in any file other than the one it's defined in.
  COUNT=$(grep -rw "$SYMBOL" functions/src | grep -v 'export ' | wc -l)
  if [ "$COUNT" -eq 0 ]; then
    echo "UNUSED SYMBOL: $SYMBOL"
  else
    # Let's count how many files contain it
    FILES=$(grep -rlw "$SYMBOL" functions/src | wc -l)
    if [ "$FILES" -le 1 ]; then
      echo "POTENTIALLY UNUSED (only in 1 file): $SYMBOL"
      # Print the file
      grep -rlw "$SYMBOL" functions/src
    fi
  fi
done

