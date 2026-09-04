# Beacon Bot - Latest Update

**4 September 2026**

## Server info improvements

`/serverinfo` now opens a compact Components V2 overview with the server icon, member counts, channels, roles, emojis, boosts and security details.

The separate action buttons were replaced by a dropdown menu for Roles, Members, Channels, Bots, Emojis and Security. Detailed lists are private and include pagination with Back, Previous and Next controls.

The pagination button IDs were fixed so every component has a unique Discord `custom_id`. This resolves the `COMPONENT_CUSTOM_ID_DUPLICATED` error when opening server details.

## Command cleanup

`/prestige` was removed from command registration, command handling and the `/help` menu. Existing level, XP and prestige data remains compatible, while the level-cap message no longer points members to an unavailable command.
