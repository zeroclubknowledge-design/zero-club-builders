-- Create the webhook function to call the edge function
create or replace function public.handle_new_message_push()
returns trigger as $$
declare
  edge_function_url text := current_setting('app.settings.edge_function_url', true);
  edge_function_key text := current_setting('app.settings.edge_function_key', true);
begin
  -- Only attempt to call if the URL is configured (prevents errors on local dev if not set up)
  if edge_function_url is not null then
    perform net.http_post(
      url := edge_function_url || '/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || edge_function_key
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', TG_TABLE_NAME,
        'record', row_to_json(NEW)
      )
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

-- Trigger for direct messages
drop trigger if exists on_message_inserted_send_push on public.messages;
create trigger on_message_inserted_send_push
  after insert on public.messages
  for each row execute function public.handle_new_message_push();
