-- 1. Disable public signup in Supabase Auth settings.
-- 2. Create an email-confirmed user using Auth > Users > Add user.
-- 3. Replace the email below and run ONCE in Supabase SQL Editor.
do $$
declare target uuid;
begin
 if exists(select 1 from public.profiles where role='admin' and active) then raise exception 'Admin aktif sudah ada. Kelola staf melalui aplikasi.'; end if;
 select id into target from auth.users where lower(email)=lower('farrel@gmail.com');
 if target is null then raise exception 'Buat akun Auth terlebih dahulu dan ganti placeholder email.'; end if;
 update public.profiles set role='admin',active=true,version=version+1 where id=target;
 if not found then raise exception 'Profil tidak ditemukan. Terapkan migrasi sebelum membuat akun Auth.'; end if;
 insert into public.audit_log(actor_id,action,entity,record_id,details) values(target,'bootstrap','profiles',target::text,'{"role":"admin","active":true}');
end $$;
