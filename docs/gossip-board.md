# Gossip Board

Gossip Board is a staff-only department feed inside WHHS RT Schedule.

It is not public, not anonymous, and does not send push notifications in this phase.

## Posting Rules

Users can create a post with:

- text up to 140 characters
- one optional image

Text is required unless an image is attached.

The composer shows:

- `What's the tea?`
- character counter
- `140 characters max. No patient info.`
- `No patient information. No clinical details.`

## Image Uploads

Supported image types:

- JPG
- JPEG
- PNG
- WebP

Unsupported in this phase:

- PDFs
- videos
- multiple images per post

Images are compressed in the browser before upload:

- max width: 1200px
- max height: 1200px
- JPEG output
- quality around 0.8

If compression succeeds, the original full-size image is not uploaded.

## Storage

Compressed images are stored in the private Supabase Storage bucket:

`gossip-images`

Storage paths are department-scoped:

`department_id/post_id/filename.jpg`

Images are not stored in `/public`, not committed to GitHub, and should not be publicly readable.

The app creates signed URLs for feed display.

## Database

Posts are stored in `gossip_posts`.

Important fields:

- `department_id`
- `staff_profile_id`
- `body`
- `image_path`
- `image_width`
- `image_height`
- `image_size_bytes`
- `is_deleted`
- `created_at`
- `updated_at`

`is_deleted = true` hides a post without hard deleting it.

## Privacy

The feed shows:

- staff display name
- timestamp
- message text
- image preview

The feed does not show:

- username
- phone number
- email
- claimed/unclaimed account status
- auth IDs

Users can read non-deleted posts only from their own department.

## Delete Behavior

Users can hide their own posts.

Admins can hide any department post through the same soft-delete behavior.

## Out Of Scope

This phase does not include:

- anonymous posting
- comments
- moderation queue
- likes or reactions
- email notifications
- SMS notifications
- push notifications for Gossip posts
- patient information
- clinical notes
