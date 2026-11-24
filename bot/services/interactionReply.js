const logger = require('./logger');
const errorHandler = require('./errorHandler');

/**
 * Safe Discord interaction replies.
 * Handles deferred/replied state and prefers ephemeral user-facing responses.
 */
async function reply(interaction, payload) {
  const body =
    payload == null || typeof payload === 'string'
      ? { content: payload == null ? '' : payload, ephemeral: true }
      : { ephemeral: true, ...payload };

  try {
    if (interaction.deferred || interaction.replied) {
      const editBody = { ...body };
      delete editBody.ephemeral;
      return await interaction.editReply(editBody);
    }
    return await interaction.reply(body);
  } catch (err) {
    logger.warn('interaction reply failed', {
      error: err.message,
      deferred: interaction.deferred,
      replied: interaction.replied,
    });
    return null;
  }
}

async function replyError(interaction, error, fallback = 'Something went wrong.') {
  const msg = errorHandler.userMessage(error, fallback);
  return reply(interaction, `❌ ${msg}`);
}

module.exports = { reply, replyError };
