// Foto de la cuenta de Google o, si no hay, su inicial. La usan la bienvenida, la barra lateral y Ajustes.
import type {User} from './store';

export default function Avatar({user,className}:{user:User;className?:string}){
  return user.picture?<img className={className} src={user.picture} alt="" referrerPolicy="no-referrer"/>:<span className={className}>{(user.name[0]??'A').toUpperCase()}</span>;
}
