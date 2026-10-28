-- Rebuild cached documents for subscriptions whose default output is being replaced.
DELETE FROM compiled_artifacts
WHERE target IN ('surge-mac', 'shadowrocket')
   OR subscription_id IN (
     SELECT id FROM subscriptions WHERE default_target IN ('surge-mac', 'shadowrocket')
   );

UPDATE subscriptions
SET default_target = CASE default_target
      WHEN 'surge-mac' THEN 'surge'
      WHEN 'shadowrocket' THEN 'v2ray'
    END,
    version = version + 1
WHERE default_target IN ('surge-mac', 'shadowrocket');

-- Abort the entire D1 batch, including source replacement and cache invalidation,
-- when another writer has already consumed the version the publisher read.
CREATE TRIGGER IF NOT EXISTS subscriptions_version_guard
BEFORE UPDATE OF version ON subscriptions
WHEN NEW.version != OLD.version + 1
BEGIN
  SELECT RAISE(ABORT, 'subscription_version_conflict');
END;
