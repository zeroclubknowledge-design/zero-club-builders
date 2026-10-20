-- Update existing matches to flying kings without resetting boards or scores.
begin;
create or replace function public.zero_draught_moves(p_board integer[],p_turn integer,p_forced integer default null)
returns jsonb language plpgsql immutable set search_path=public as $$
declare
 steps jsonb:='[]'; jumps jsonb:='[]'; src integer; piece integer;
 dr integer; dc integer; r integer; c integer; nr integer; nc integer;
 dst integer; middle integer; distance integer; captured integer;
begin
 for src in 0..63 loop
  piece:=p_board[src+1];
  if sign(piece)<>p_turn or (p_forced is not null and src<>p_forced) then continue;end if;
  r:=src/8;c:=src%8;
  foreach dr in array array[-1,1] loop
   if abs(piece)=1 and dr<>p_turn then continue;end if;
   foreach dc in array array[-1,1] loop
    if abs(piece)=2 then
     captured:=null;
     for distance in 1..7 loop
      nr:=r+dr*distance;nc:=c+dc*distance;
      if nr<0 or nr>7 or nc<0 or nc>7 then exit;end if;
      dst:=nr*8+nc;
      if p_board[dst+1]<>0 then
       if captured is not null or sign(p_board[dst+1])=p_turn then exit;end if;
       captured:=dst;
      elsif captured is not null then
       jumps:=jumps||jsonb_build_array(jsonb_build_object('from',src,'to',dst,'capture',captured));
      elsif p_forced is null then
       steps:=steps||jsonb_build_array(jsonb_build_object('from',src,'to',dst,'capture',null));
      end if;
     end loop;
     continue;
    end if;
    nr:=r+dr;nc:=c+dc;
    if nr<0 or nr>7 or nc<0 or nc>7 then continue;end if;
    middle:=nr*8+nc;
    if p_board[middle+1]=0 and p_forced is null then steps:=steps||jsonb_build_array(jsonb_build_object('from',src,'to',middle,'capture',null));end if;
    nr:=r+2*dr;nc:=c+2*dc;dst:=nr*8+nc;
    if sign(p_board[middle+1])=-p_turn and nr between 0 and 7 and nc between 0 and 7 and p_board[dst+1]=0 then
     jumps:=jumps||jsonb_build_array(jsonb_build_object('from',src,'to',dst,'capture',middle));
    end if;
   end loop;
  end loop;
 end loop;
 return case when jsonb_array_length(jumps)>0 or p_forced is not null then jumps else steps end;
end $$;
commit;
