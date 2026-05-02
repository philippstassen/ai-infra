# Channels

Channel adapters normalize Telegram and Discord events into a common inbound event shape and send outbound responses.

Adapters should stay thin: they do not own prompts, tools, model selection, or workflow behavior.
